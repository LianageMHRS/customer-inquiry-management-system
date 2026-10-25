import { z } from 'zod'
import { pool } from '../src/db/pool.js'
import { createStaffAccount } from '../src/auth/auth-service.js'

const emailSchema = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email())
  .transform((email) => email.toLowerCase())

const passwordSchema = z.string().min(12).max(128)

/** Prompt for a password without echoing typed characters to the terminal. */
function readHiddenPassword(prompt: string): Promise<string> {
  const input = process.stdin

  if (!input.isTTY) {
    return Promise.reject(
      new Error('Run this command from an interactive terminal'),
    )
  }

  process.stdout.write(prompt)
  input.setEncoding('utf8')
  input.setRawMode(true)
  input.resume()

  return new Promise((resolve, reject) => {
    let password = ''

    function finish(error?: Error) {
      input.off('data', handleInput)
      input.setRawMode(false)
      input.pause()
      process.stdout.write('\n')

      if (error !== undefined) {
        reject(error)
      } else {
        resolve(password)
      }
    }

    function handleInput(chunk: string | Buffer) {
      for (const character of chunk.toString()) {
        if (character === '\u0003') {
          finish(new Error('Account creation was cancelled'))
          return
        }

        if (character === '\r' || character === '\n') {
          finish()
          return
        }

        if (character === '\u007f' || character === '\b') {
          password = Array.from(password).slice(0, -1).join('')
        } else if (character >= ' ') {
          password += character
        }
      }
    }

    input.on('data', handleInput)
  })
}

/** Validate one staff account and create it with an Argon2id password hash. */
async function createUser(): Promise<void> {
  const email = emailSchema.safeParse(process.argv[2])

  if (!email.success || process.argv.length !== 3) {
    throw new Error(
      'Usage: npm.cmd run user:create -- staff-member@example.com',
    )
  }

  const password = passwordSchema.safeParse(
    await readHiddenPassword('Password (12-128 characters, hidden): '),
  )

  if (!password.success) {
    throw new Error('Password must be between 12 and 128 characters')
  }

  const confirmation = await readHiddenPassword('Confirm password: ')

  if (password.data !== confirmation) {
    throw new Error('Passwords do not match')
  }

  const user = await createStaffAccount(email.data, password.data)

  if (user === null) {
    throw new Error(`A staff account already exists for ${email.data}`)
  }

  process.stdout.write(`Staff account created for ${email.data}.\n`)
}

try {
  await createUser()
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error'
  process.stderr.write(`Unable to create staff account: ${message}\n`)
  process.exitCode = 1
} finally {
  await pool.end()
}
