//      
                      
                   
                             
  

export default function getSubcommand(
  cliArgs          ,
  config               
) {
  const [subcommand, ...rest] = cliArgs;
  for (const k of Object.keys(config)) {
    if (k !== 'default' && config[k].indexOf(subcommand) !== -1) {
      return { subcommand: k, args: rest };
    }
  }
  return {
    subcommand: config.default,
    args: cliArgs
  };
}
