import { spawn } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const workspaces = ['@customer-inquiry/api', '@customer-inquiry/web']
// Launch both workspaces with inherited output so their logs remain visible.
const children = workspaces.map((workspace) =>
  spawn(npmCommand, ['run', 'dev', `--workspace=${workspace}`], {
    shell: process.platform === 'win32',
    stdio: 'inherit',
  }),
)

let isStopping = false

/** Stop sibling development servers after a failure or terminal signal. */
function stopChildren(signal) {
  if (isStopping) {
    return
  }

  isStopping = true
  for (const child of children) {
    if (child.exitCode === null) {
      child.kill(signal)
    }
  }
}

for (const child of children) {
  // Stop the other workspace if one child fails to start.
  child.on('error', (error) => {
    console.error('Unable to start a development server:', error.message)
    stopChildren('SIGTERM')
    process.exitCode = 1
  })
  // Keep both services running only while neither child has exited.
  child.on('exit', (code) => {
    if (!isStopping) {
      process.exitCode = code ?? 1
      stopChildren('SIGTERM')
    }
  })
}

process.on('SIGINT', () => stopChildren('SIGINT'))
process.on('SIGTERM', () => stopChildren('SIGTERM'))
