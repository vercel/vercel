//      
                                    

export default function updateDomain(
  now     ,
  name        ,
  cdnEnabled         
) {
  return now.fetch(`/v3/domains/${name}`, {
    body: { op: 'setCdn', value: cdnEnabled },
    method: 'PATCH'
  });
}
