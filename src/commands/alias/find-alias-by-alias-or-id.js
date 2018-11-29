//      

                                              

function getSafeAlias(alias        ) {
  return alias
    .replace(/^https:\/\//i, '')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .toLowerCase();
}

export default async function findAliasByAliasOrId(
  output        ,
  now     ,
  aliasOrId        
)                 {
  return now.fetch(
    `/now/aliases/${encodeURIComponent(getSafeAlias(aliasOrId))}`
  );
}
