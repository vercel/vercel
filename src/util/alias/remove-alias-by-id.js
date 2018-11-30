//      


export default async function removeAliasById(now     , id        ) {
  return now.fetch(`/now/aliases/${id}`, {
    method: 'DELETE'
  });
}
