import { spawn } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const workspaces = ['@customer-inquiry/api', '@customer-inquiry/web']
const children = workspaces.map((workspace) =>
  spawn(npmCommand, ['run', 'dev', `--workspace=${workspace}`], {
    shell: process.platform === 'win32',
    stdio: 'inherit',
  }),
)

let isStopping = false

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
  child.on('error', (error) => {
    console.error('Unable to start a development server:', error.message)
    stopChildren('SIGTERM')
    process.exitCode = 1
  })
  child.on('exit', (code) => {
    if (!isStopping) {
      process.exitCode = code ?? 1
      stopChildren('SIGTERM')
    }
  })
}

process.on('SIGINT', () => stopChildren('SIGINT'))
process.on('SIGTERM', () => stopChildren('SIGTERM'))
