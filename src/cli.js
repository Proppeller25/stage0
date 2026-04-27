const { handleAuthCommand } = require('./commands/auth')

async function run(args) {
  const [command, ...rest] = args

  if (!command) {
    printHelp()
    return
  }

  if ([ 'login', 'logout', 'whoami' ].includes(command)) {
    await handleAuthCommand(command, rest)
    return
  }

  console.log(`Command not implemented yet: ${command}`)
}

function printHelp() {
  console.log('Insighta CLI')
  console.log('')
  console.log('Available commands:')
  console.log('  insighta login')
  console.log('  insighta logout')
  console.log('  insighta whoami')
}

module.exports = { run }
