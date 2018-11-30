//      


async function deleteCertById(output        , now     , id        ) {
  return now.fetch(`/v3/now/certs/${id}`, {
    method: 'DELETE'
  });
}

export default deleteCertById;
