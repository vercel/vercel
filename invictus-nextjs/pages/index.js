import { useEffect, useState } from 'react'
import Head from 'next/head'
import { motion } from 'framer-motion'
import { CheckCircle, Car, Home, Building2, Bike, Shield, FileCheck2, Phone, Mail, Globe } from 'lucide-react'
import Section from '@/components/Section'

const colors = {
  navy: '#0B1B2B',
  navyDark: '#07111C',
  gold: '#D4AF37',
  goldSoft: '#E6C975',
  light: '#F7F8FA',
  slate: '#1F2937',
}

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
}

const smoothScroll = (e, id) => {
  e.preventDefault()
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function HomePage() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [language, setLanguage] = useState('en')
  const [showLogo, setShowLogo] = useState(true)
  const [showTitle, setShowTitle] = useState(true)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', onScroll)
    const stored = window.localStorage.getItem('invictus-lang')
    if (stored) setLanguage(stored)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    try { window.localStorage.setItem('invictus-lang', language) } catch {}
  }, [language])

  const t = (en, es) => (language === 'en' ? en : es)

  return (
    <>
      <Head>
        <title>Invictus Auto Insurance</title>
        <meta name="description" content="Auto-first insurance. Fair rates. Fast quotes." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <header className={`header ${scrolled ? 'shadow' : ''}`}>
        <div className="container hdrwrap">
          <a href="#home" onClick={(e) => smoothScroll(e, 'home')} className="logoRow">
            {showLogo ? (
              <img src="/images/invictus-logo.png" alt="Invictus winged shield logo" style={{height: 40}} onError={() => setShowLogo(false)} />
            ) : (
              <div className="badgeIA" aria-label="Invictus Logo">IA</div>
            )}
            {showTitle ? (
              <img src="/images/invictus-title.jpg" alt="Invictus wordmark" style={{height: 24}} onError={() => setShowTitle(false)} />
            ) : (
              <div>
                <div style={{fontWeight:600}}>Invictus Auto Insurance</div>
                <div className="small">{t('Strong. Smart. Shielded.', 'Fuerte. Inteligente. Protegido.')}</div>
              </div>
            )}
          </a>
          <div style={{display:'flex', alignItems:'center', gap:16}}>
            <button onClick={() => setLanguage(language === 'en' ? 'es' : 'en')} className="mobileMenuBtn" aria-label={t('Switch to Spanish','Cambiar a Inglés')}>
              <Globe size={16} /> {language === 'en' ? 'ES' : 'EN'}
            </button>
            <nav className="nav" style={{display:'none'}} id="desktopNav"></nav>
            <nav className="nav" style={{display:'none'}} id="placeholder"></nav>
            <nav className="nav desktopNav">
              {[
                [t('Home','Inicio'),'home'],
                [t('Auto','Auto'),'auto'],
                [t('Other Products','Otros Productos'),'products'],
                [t('Why Invictus','Por qué Invictus'),'why'],
                [t('FAQ','Preguntas'),'faq'],
                [t('Contact','Contacto'),'contact'],
              ].map(([label,id]) => (
                <a key={id} href={`#${id}`} onClick={(e)=>smoothScroll(e,id)}>{label}</a>
              ))}
              <a href="#quote" onClick={(e)=>smoothScroll(e,'quote')} className="btn btn-primary">{t('Get a Quote','Obtener Cotización')}</a>
            </nav>
            <button onClick={()=>setMobileOpen(v=>!v)} className="mobileMenuBtn" aria-label={t('Toggle navigation','Abrir menú')}> {t('Menu','Menú')} </button>
          </div>
        </div>
        {mobileOpen && (
          <div className="mobileSheet">
            <div className="container" style={{display:'grid', gap:12}}>
              {['home','auto','products','why','faq','contact','quote'].map((id)=> (
                <a key={id} href={`#${id}`} className="mobileLink" onClick={(e)=>{smoothScroll(e,id); setMobileOpen(false)}}>
                  {id==='quote' ? t('Get a Quote','Obtener Cotización')
                    : t(id[0].toUpperCase()+id.slice(1),
                      id==='home'?'Inicio':id==='auto'?'Auto':id==='products'?'Otros Productos':id==='why'?'Por qué Invictus':id==='faq'?'Preguntas':'Contacto'
                    )}
                </a>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="container" style={{paddingTop:96}}>
        <Section id="home" className="section">
          <div className="hero">
            <motion.div variants={fadeIn} initial="hidden" whileInView="show" viewport={{ once: true }}>
              <div style={{display:'flex', flexDirection:'column', gap:16, maxWidth:760}}>
                <div className="small" style={{display:'inline-flex', alignItems:'center', gap:8}}>
                  <Shield size={16} /> {t('Trusted Texas Insurance','Seguro de Texas de Confianza')}
                </div>
                <h1 style={{fontSize:'40px', lineHeight:1.1, margin:0}}>
                  {t('Auto Insurance built for real life. Fair rates. Fast quotes. No fluff.', 'Seguro de Auto para la vida real. Tarifas justas. Cotizaciones rápidas. Sin rodeos.')}
                </h1>
                <p style={{opacity:.9, fontSize:18}}>
                  {t('Invictus focuses on Auto first—because it’s where speed and savings matter most. We also offer Home, Renters, Commercial Auto, Motorcycle, and SR-22 support when you need a broader shield.',
                     'Invictus se enfoca primero en Auto—donde la velocidad y el ahorro importan más. También ofrecemos Casa, Renters, Auto Comercial, Motocicleta y apoyo con SR-22 cuando necesites una protección más amplia.')}
                </p>
                <div style={{display:'flex', gap:12, flexWrap:'wrap'}}>
                  <a href="#quote" onClick={(e)=>smoothScroll(e,'quote')} className="btn btn-primary">{t('Get My Auto Quote','Obtener mi Cotización de Auto')}</a>
                  <a href="#products" onClick={(e)=>smoothScroll(e,'products')} className="btn btn-secondary">{t('Explore Other Products','Ver Otros Productos')}</a>
                </div>
                <div style={{display:'flex', gap:16, fontSize:14, opacity:.9}}>
                  <span style={{display:'inline-flex', gap:6, alignItems:'center'}}><CheckCircle size={16}/> {t('No credit pull for quotes','Sin revisión de crédito para cotizar')}</span>
                  <span style={{display:'inline-flex', gap:6, alignItems:'center'}}><CheckCircle size={16}/> {t('TX licenses + foreign licenses','Licencias de TX y extranjeras aceptadas')}</span>
                  <span style={{display:'inline-flex', gap:6, alignItems:'center'}}><CheckCircle size={16}/> {t('Bilingual service','Atención bilingüe')}</span>
                </div>
              </div>
            </motion.div>
          </div>
        </Section>

        <Section id="auto" className="section">
          <motion.div variants={fadeIn} initial="hidden" whileInView="show" viewport={{ once: true }} className="grid grid2" >
            <div style={{order:2}}>
              <h2 style={{fontSize:'32px', margin:'0 0 12px'}}>{t('Texas Auto Insurance, simplified.','Seguro de Auto en Texas, simplificado.')}</h2>
              <p style={{color:'#4B5563'}}>
                {t('Whether you need liability-only, full coverage, or help after a lapse—we’ll compare rates across multiple carriers and bind the right policy fast. Multi-car, prior insurance, and safe driver discounts available.',
                   'Si necesitas solo responsabilidad civil, cobertura completa, o ayuda tras una pausa—comparamos tarifas en múltiples aseguradoras y emitimos la póliza adecuada rápidamente. Descuentos por varios autos, seguro previo y buen conductor.')}
              </p>
              <ul style={{marginTop:16, paddingLeft:0, listStyle:'none', display:'grid', gap:8, color:'#374151'}}>
                {[
                  t('Same-day bind & instant ID cards','Emisión el mismo día y tarjetas de identificación al instante'),
                  t('SR-22 filings available','Presentación de SR-22 disponible'),
                  t('Foreign licenses & passports accepted','Se aceptan licencias extranjeras y pasaportes'),
                ].map(item => (<li key={item} style={{display:'flex', gap:8, alignItems:'flex-start'}}><CheckCircle size={20} color={colors.gold}/><span>{item}</span></li>))}
              </ul>
              <div style={{marginTop:16, display:'flex', gap:12}}>
                <a href="#quote" onClick={(e)=>smoothScroll(e,'quote')} className="btn" style={{background:colors.navy, color:'#fff'}}>{t('Start Auto Quote','Comenzar Cotización de Auto')}</a>
                <a href="#faq" onClick={(e)=>smoothScroll(e,'faq')} className="btn" style={{border:'1px solid #D1D5DB'}}>{t('See Coverage FAQs','Ver Preguntas Frecuentes')}</a>
              </div>
            </div>
            <div style={{order:1}}>
              <div className="card shadow" style={{overflow:'hidden'}}>
                <div style={{aspectRatio:'16/10', background:'linear-gradient(135deg,#fff,#f1f5f9)', display:'grid', placeItems:'center'}}>
                  <Car size={96} color={colors.navy} />
                </div>
                <div className="badge" style={{position:'absolute', right:12, bottom:12, background:colors.gold, color:colors.navy}}>{t('Auto First','Auto Primero')}</div>
              </div>
            </div>
          </motion.div>
        </Section>

        <Section id="products" className="section">
          <motion.div variants={fadeIn} initial="hidden" whileInView="show" viewport={{ once: true }}>
            <h3 style={{fontSize:'28px', margin:'0 0 8px'}}>{t('Other Products (when you need more than a car policy)','Otros Productos (cuando necesitas más que una póliza de auto)')}</h3>
            <p style={{color:'#4B5563', maxWidth:720}}>{t('Auto is our specialty, but life isn’t one-dimensional. Bundle or add-on what fits—without the runaround.','Auto es nuestra especialidad, pero la vida no es de una sola pieza. Combina o agrega lo que necesites—sin complicaciones.')}</p>
            <div className="grid grid3" style={{marginTop:24}}>
              {[
                { titleEn: 'Home Insurance', titleEs: 'Seguro de Casa', icon: Home, blurbEn: 'Protect the roof over your head—from storms to surprises.', blurbEs: 'Protege el techo de tu hogar—de tormentas a sorpresas.'},
                { titleEn: 'Renters Insurance', titleEs: 'Seguro de Renters', icon: Building2, blurbEn: 'Your stuff, covered. Affordable and flexible.', blurbEs: 'Tus pertenencias, cubiertas. Económico y flexible.'},
                { titleEn: 'Commercial Auto', titleEs: 'Auto Comercial', icon: Car, blurbEn: 'From contractors to fleets, keep your wheels earning.', blurbEs: 'De contratistas a flotillas, mantén tus ruedas produciendo.'},
                { titleEn: 'Motorcycle', titleEs: 'Motocicleta', icon: Bike, blurbEn: 'Ride free with coverage that actually understands bikes.', blurbEs: 'Conduce libre con cobertura que entiende a las motos.'},
                { titleEn: 'SR-22 Assistance', titleEs: 'Asistencia con SR-22', icon: FileCheck2, blurbEn: 'File fast and get back on the road with confidence.', blurbEs: 'Presenta rápido y vuelve a la carretera con confianza.'},
                { titleEn: 'Umbrella', titleEs: 'Umbrella (Responsabilidad extra)', icon: Shield, blurbEn: 'Extra liability for when life throws curveballs.', blurbEs: 'Responsabilidad extra para cuando la vida te sorprenda.'},
              ].map(({titleEn,titleEs,icon:Icon,blurbEn,blurbEs}) => (
                <div key={titleEn} className="card" style={{padding:24}}>
                  <div style={{display:'flex', alignItems:'center', gap:12}}>
                    <div style={{width:44, height:44, borderRadius:12, display:'grid', placeItems:'center', background:'rgba(212,175,55,0.13)'}}>
                      <Icon size={20} color={colors.navy}/>
                    </div>
                    <h4 style={{margin:0}}>{t(titleEn,titleEs)}</h4>
                  </div>
                  <p style={{color:'#4B5563', marginTop:12, fontSize:14}}>{t(blurbEn, blurbEs)}</p>
                  <a href="#quote" onClick={(e)=>smoothScroll(e,'quote')} style={{color:colors.navy, fontWeight:600, fontSize:14}}>{t('Add to my quote →','Agregar a mi cotización →')}</a>
                </div>
              ))}
            </div>
          </motion.div>
        </Section>

        <Section id="why" className="section">
          <motion.div variants={fadeIn} initial="hidden" whileInView="show" viewport={{ once: true }} className="card" style={{overflow:'hidden'}}>
            <div className="grid grid2">
              <div style={{padding:32, background:colors.navy, color:'#fff'}}>
                <h3 style={{margin:'0 0 12px'}}>{t('Why drivers switch to Invictus','Por qué los conductores eligen Invictus')}</h3>
                <ul style={{margin:0, paddingLeft:0, listStyle:'none', display:'grid', gap:12}}>
                  {[
                    t('Multiple carriers compared in minutes','Varias aseguradoras comparadas en minutos'),
                    t('Transparent pricing—no surprise fees','Precios transparentes—sin cargos sorpresa'),
                    t('Human help by phone, text, or email','Atención humana por teléfono, texto o correo'),
                    t('Bilingual agents (English/Español)','Agentes bilingües (Inglés/Español)'),
                  ].map(item => (
                    <li key={item} style={{display:'flex', gap:10, alignItems:'flex-start'}}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 12l2 2 4-4" stroke="#E6C975" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="9" stroke="#E6C975" strokeWidth="2"/></svg>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div style={{padding:32, background:'#fff'}}>
                <h4 style={{margin:'0 0 12px'}}>{t('Real results, real simple','Resultados reales, sin complicaciones')}</h4>
                <div className="kpis">
                  {[
                    {kpi:t('15 min','15 min'), label:t('Avg. time to bind','Tiempo promedio de emisión')},
                    {kpi:t('$480','$480'), label:t('Avg. annual savings','Ahorro anual promedio')},
                    {kpi:t('98%','98%'), label:t('Customer satisfaction','Satisfacción del cliente')},
                  ].map(({kpi,label}) => (
                    <div key={label} className="card" style={{padding:20, textAlign:'center'}}>
                      <div style={{fontSize:24, fontWeight:700, color:colors.navy}}>{kpi}</div>
                      <div style={{fontSize:12, color:'#6B7280', marginTop:4}}>{label}</div>
                    </div>
                  ))}
                </div>
                <p style={{fontSize:12, color:'#6B7280', marginTop:12}}>{t('*Illustrative metrics for demo purposes.','*Métricas ilustrativas para fines de demostración.')}</p>
              </div>
            </div>
          </motion.div>
        </Section>

        <Section id="quote" className="section">
          <motion.div variants={fadeIn} initial="hidden" whileInView="show" viewport={{ once: true }} className="card" style={{padding:24}}>
            <div className="grid" style={{gridTemplateColumns:'1fr', gap:24}}>
              <div>
                <h3 style={{margin:'0 0 8px'}}>{t('Get your Auto quote','Obtén tu cotización de Auto')}</h3>
                <p style={{color:'#4B5563'}}>{t('Fast, no-pressure estimates. We’ll text or email the best option.','Estimados rápidos, sin presión. Te enviaremos por texto o correo la mejor opción.')}</p>
              </div>
              <form method="post" action="/api/quote" className="grid" style={{gridTemplateColumns:'1fr 1fr', gap:12}}>
                <input name="name" placeholder={t('Full name','Nombre completo')} className="card" style={{padding:12}} />
                <input name="phone" placeholder={t('Phone number','Número de teléfono')} className="card" style={{padding:12}} />
                <input name="email" placeholder={t('Email','Correo electrónico')} className="card" style={{padding:12, gridColumn:'span 2'}} />
                <input name="zip" placeholder={t('ZIP code','Código Postal')} className="card" style={{padding:12}} />
                <select name="coverage" className="card" style={{padding:12}}>
                  <option>{t('Coverage type','Tipo de cobertura')}</option>
                  <option>{t('Liability only','Solo responsabilidad')}</option>
                  <option>{t('Full coverage','Cobertura completa')}</option>
                  <option>{t('Not sure yet','Aún no sé')}</option>
                </select>
                <select name="addons" className="card" style={{padding:12}}>
                  <option>{t('Add-ons','Adicionales')}</option>
                  <option>SR-22</option>
                  <option>{t('Home','Casa')}</option>
                  <option>{t('Renters','Renters')}</option>
                  <option>{t('Motorcycle','Motocicleta')}</option>
                  <option>{t('Commercial Auto','Auto Comercial')}</option>
                </select>
                <textarea name="notes" rows="4" placeholder={t('Anything we should know (tickets, claims, prior insurance, etc.)','Algo que debamos saber (multas, reclamos, seguro previo, etc.)')} className="card" style={{padding:12, gridColumn:'span 2'}} />
                <button type="submit" className="btn" style={{background:colors.navy, color:'#fff', gridColumn:'span 2'}}>{t('Submit','Enviar')}</button>
                <div style={{fontSize:12, color:'#6B7280', gridColumn:'span 2'}}>{t('By submitting, you agree to be contacted by Invictus regarding your quote.','Al enviar, aceptas ser contactado por Invictus sobre tu cotización.')}</div>
              </form>
            </div>
          </motion.div>
        </Section>

        <Section id="faq" className="section">
          <motion.div variants={fadeIn} initial="hidden" whileInView="show" viewport={{ once: true }} className="grid grid2">
            {[
              [
                t('Do you check credit for a quote?','¿Revisan el crédito para cotizar?'),
                t("No—getting a quote won’t affect your credit. We focus on your driving details to match carriers and discounts.", 'No—obtener una cotización no afectará tu crédito. Nos enfocamos en tus datos de conducción para encontrar aseguradoras y descuentos.'),
              ],
              [
                t('Can I use a foreign driver’s license?','¿Puedo usar una licencia extranjera?'),
                t('Yes. We work with carriers that accept TX licenses, foreign licenses, and passports.','Sí. Trabajamos con aseguradoras que aceptan licencias de TX, licencias extranjeras y pasaportes.'),
              ],
              [
                t('How fast can I get proof of insurance?','¿Qué tan rápido puedo obtener comprobante de seguro?'),
                t('Often the same day. Once you choose a policy, we issue ID cards right away.','A menudo el mismo día. Una vez que eliges la póliza, emitimos las tarjetas de identificación de inmediato.'),
              ],
              [
                t('Do you offer SR-22 filings?','¿Ofrecen presentación de SR-22?'),
                t('Absolutely. We help file quickly so you can get back on the road.','Claro. Te ayudamos a presentarlo rápidamente para que vuelvas a la carretera.'),
              ],
            ].map(([q,a]) => (
              <div key={q} className="card" style={{padding:24}}>
                <h4 style={{margin:'0 0 8px'}}>{q}</h4>
                <p style={{color:'#4B5563', fontSize:14}}>{a}</p>
              </div>
            ))}
          </motion.div>
        </Section>

        <Section id="contact" className="section" >
          <motion.div variants={fadeIn} initial="hidden" whileInView="show" viewport={{ once: true }} className="card" style={{overflow:'hidden'}}>
            <div className="grid grid2">
              <div style={{padding:24}}>
                <h3 style={{margin:'0 0 8px'}}>{t('Talk to a human','Habla con una persona')}</h3>
                <p style={{color:'#4B5563'}}>{t('Give us a shout. We’ll help you weigh options and lock the right coverage.','Llámanos. Te ayudamos a evaluar opciones y asegurar la cobertura correcta.')}</p>
                <div style={{display:'grid', gap:12, color:'#374151'}}>
                  <div style={{display:'flex', gap:10, alignItems:'center'}}><Phone size={20} color={colors.navy}/><span>(555) 555-0123</span></div>
                  <div style={{display:'flex', gap:10, alignItems:'center'}}><Mail size={20} color={colors.navy}/><span>quotes@invictusauto.com</span></div>
                </div>
              </div>
              <div style={{padding:24, background:colors.navy, color:'#fff'}}>
                <h4 style={{margin:'0 0 8px'}}>{t('Hours','Horarios')}</h4>
                <ul style={{margin:0, paddingLeft:18}}>
                  <li>{t('Mon–Fri: 9:00am – 6:00pm','Lun–Vie: 9:00am – 6:00pm')}</li>
                  <li>{t('Sat: 10:00am – 2:00pm','Sáb: 10:00am – 2:00pm')}</li>
                  <li>{t('Sun: Closed','Dom: Cerrado')}</li>
                </ul>
                <h4 style={{margin:'16px 0 8px'}}>{t('Service Area','Área de Servicio')}</h4>
                <p style={{opacity:.9}}>{t('Texas + surrounding states. Ask about availability in your ZIP.','Texas + estados cercanos. Pregunta por disponibilidad en tu código postal.')}</p>
                <a href="#quote" onClick={(e)=>smoothScroll(e,'quote')} className="btn btn-primary" style={{marginTop:12}}>{t('Start Your Quote','Comienza tu Cotización')}</a>
              </div>
            </div>
          </motion.div>
        </Section>
      </main>

      <footer className="footer">
        <Section>
          <div style={{display:'flex', gap:16, alignItems:'center', justifyContent:'space-between', flexWrap:'wrap'}}>
            <div style={{display:'flex', alignItems:'center', gap:12}}>
              {showLogo ? (
                <img src="/images/invictus-logo.png" alt="Invictus winged shield logo" style={{height: 36}} onError={() => setShowLogo(false)} />
              ) : (
                <div className="badgeIA">IA</div>
              )}
              <div>
                <div style={{color:'#fff', fontWeight:600}}>Invictus Auto Insurance</div>
                <div style={{fontSize:12, opacity:.8}}>© {new Date().getFullYear()} Invictus Insurance Group LLC</div>
              </div>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:24}}>
              <div>
                <div className="small" style={{color:'rgba(255,255,255,0.6)'}}>{t('Products','Productos')}</div>
                <ul style={{margin:0, paddingLeft:18}}>
                  <li><a href="#auto">{t('Auto','Auto')}</a></li>
                  <li><a href="#products">{t('Home','Casa')}</a></li>
                  <li><a href="#products">{t('Renters','Renters')}</a></li>
                  <li><a href="#products">{t('Commercial Auto','Auto Comercial')}</a></li>
                </ul>
              </div>
              <div>
                <div className="small" style={{color:'rgba(255,255,255,0.6)'}}>{t('Company','Compañía')}</div>
                <ul style={{margin:0, paddingLeft:18}}>
                  <li><a href="#why">{t('Why Invictus','Por qué Invictus')}</a></li>
                  <li><a href="#faq">{t('FAQ','Preguntas')}</a></li>
                  <li><a href="#contact">{t('Contact','Contacto')}</a></li>
                </ul>
              </div>
              <div>
                <div className="small" style={{color:'rgba(255,255,255,0.6)'}}>{t('Legal','Legal')}</div>
                <ul style={{margin:0, paddingLeft:18}}>
                  <li style={{opacity:.8}}>{t('Licensing & Disclosures','Licencias y Divulgaciones')}</li>
                  <li style={{opacity:.8}}>{t('Terms & Privacy','Términos y Privacidad')}</li>
                </ul>
              </div>
            </div>
          </div>
        </Section>
      </footer>
    </>
  )
}
