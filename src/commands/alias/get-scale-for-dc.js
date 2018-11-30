//      
                                                                               

function getScaleForDC(
  dc        ,
  deployment                                  
) {
  const dcAttrs = (deployment.scale && deployment.scale[dc]) || {};
  const safeScale        = { min: dcAttrs.min, max: dcAttrs.max };
  return safeScale;
}

export default getScaleForDC;
