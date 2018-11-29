//      

                                                   

async function getCertById(output        , now     , id        ) {
  const cert                     = await now.fetch(`/v3/now/certs/${id}`);
  return cert;
}

export default getCertById;
