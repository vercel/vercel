//      

import findAliasByAliasOrId from './find-alias-by-alias-or-id';
                                              

async function getPreviousAlias(
  output        ,
  now     ,
  alias        
)                        {
  return findAliasByAliasOrId(output, now, alias);
}

export default getPreviousAlias;
