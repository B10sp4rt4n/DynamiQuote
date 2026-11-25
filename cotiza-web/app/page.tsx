import type { Metadata } from "next";
import Link from "next/link";
import { CotizaBrand } from "@/components/ui/cotiza-brand";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "Cotiza · Dale claridad a cada negocio",
  description: "Clientes, oportunidades, cotizaciones con utilidad, propuestas y facturación. Cotiza conecta tu trabajo comercial para que puedas cuidar cada negocio.",
};

const journey = [
  { number: "01", title: "Abre la oportunidad", description: "Dale un lugar a cada negocio y a la relación con tu cliente." },
  { number: "02", title: "Cotiza con claridad", description: "Revisa costos, precios y utilidad antes de avanzar." },
  { number: "03", title: "Presenta tu propuesta", description: "Cuida las aprobaciones y comparte una propuesta formal." },
  { number: "04", title: "Continúa al cierre", description: "Registra lo ganado y da seguimiento a la factura y los pagos." },
];

const capabilities = [
  { number: "01", title: "Tus clientes, con contexto", description: "Reúne empresas, contactos y oportunidades. Consulta las propuestas de cada negocio y distingue lo abierto, lo ganado y lo descartado.", detail: "Un lugar para retomar la conversación." },
  { number: "02", title: "Números que sí te dicen algo", description: "Calcula precio desde margen o margen desde precio. Consulta venta, costo y utilidad bruta estimada, y conserva las versiones de tu cotización.", detail: "Conoce lo que vendes y lo que te deja." },
  { number: "03", title: "Propuestas bien cuidadas", description: "Prepara propuestas con tu imagen, revisa las autorizaciones según la política de margen y distingue la aprobación del envío al cliente.", detail: "PDF, Excel y envío por correo desde tu operación." },
  { number: "04", title: "El trabajo sigue después del sí", description: "Genera prefacturas en PDF y continúa hacia la emisión de CFDI y el seguimiento de pagos. Consulta los indicadores de venta y margen de tu operación.", detail: "Facturación disponible según la configuración de tu empresa." },
];

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{diagonal ? <path d="M6 18 18 6M6 6h12v12" /> : <path d="M4 12h15m-6-6 6 6-6 6" />}</svg>;
}

export default function Home() {
  return (
    <div className={styles.landing}>
      <a className={styles.skipLink} href="#contenido">Ir al contenido</a>
      <header className={styles.header}>
        <div className={styles.container}><div className={styles.headerInner}>
          <CotizaBrand href="/" subtitle={null} />
          <nav className={styles.navigation} aria-label="Navegación principal">
            <a className={styles.navLink} href="#recorrido">El recorrido</a>
            <a className={styles.navLink} href="#funciones">Qué puedes hacer</a>
            <Link className={styles.loginLink} href="/sign-in">Iniciar sesión <Arrow diagonal /></Link>
          </nav>
        </div></div>
      </header>

      <main id="contenido">
        <section className={`${styles.hero} ${styles.container}`} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Tu trabajo comercial, en orden</p>
            <h1 id="hero-title">Dale claridad<br />a cada <em>negocio.</em></h1>
            <p className={styles.heroDescription}>Más tiempo para tus clientes. Más claridad para decidir. Cotiza reúne oportunidades, cotizaciones, propuestas y facturación para acompañarte de principio a fin.</p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryButton} href="/inicio">Entrar a Cotiza <Arrow /></Link>
              <a className={styles.textLink} href="#recorrido">Conoce cómo te acompaña <span aria-hidden="true">↓</span></a>
            </div>
            <p className={styles.heroNote}>Cada cliente en su lugar. Cada número más claro.</p>
          </div>
          <div className={styles.heroVisual}>
            <div className={styles.visualHeading}><span className={styles.smallSun} aria-hidden="true">✳</span> Los detalles hacen un buen negocio.</div>
            <div className={styles.paperStack}><div className={styles.paper}>
              <div className={styles.paperTop}><span className={styles.paperBrand}>Cotiza<span>.</span></span><span className={styles.draftBadge}>En preparación</span></div>
              <p className={styles.exampleLabel}>Ejemplo ilustrativo · MXN, antes de IVA</p>
              <h2>Una propuesta<br />con todo en su lugar.</h2>
              <div className={styles.paperLines}>
                <div><span>Venta propuesta</span><strong>$12,500.00</strong></div>
                <div><span>Costo total</span><strong>$10,000.00</strong></div>
              </div>
              <div className={styles.profitBlock}><div><span>Utilidad bruta estimada</span><strong>$2,500.00</strong></div><span className={styles.marginBadge}>20% de margen</span></div>
              <p className={styles.paperFootnote}>Antes de gastos de operación.</p>
              <div className={styles.paperFooter}><span>Lista para el siguiente paso</span><Arrow /></div>
            </div></div>
            <div className={styles.visualNote}><span aria-hidden="true">✓</span><p><strong>La tranquilidad de tenerlo claro.</strong><br />Desde el precio hasta la utilidad.</p></div>
          </div>
        </section>

        <section className={styles.journeySection} id="recorrido" aria-labelledby="journey-title">
          <div className={styles.container}>
            <div className={styles.sectionIntro}><p className={styles.eyebrow}>Un paso lleva al siguiente</p><h2 id="journey-title">De una buena conversación<br />a un negocio bien llevado.</h2></div>
            <ol className={styles.journey}>{journey.map((step) => <li key={step.number}><span className={styles.stepNumber}>{step.number}</span><h3>{step.title}</h3><p>{step.description}</p></li>)}</ol>
          </div>
        </section>

        <section className={`${styles.capabilitiesSection} ${styles.container}`} id="funciones" aria-labelledby="capabilities-title">
          <div className={styles.capabilitiesIntro}>
            <div><p className={styles.eyebrow}>Lo que ya puedes hacer</p><h2 id="capabilities-title">Lo cotidiano,<br /><em>mejor resuelto.</em></h2></div>
            <p>Cotiza ha crecido con tu operación: hoy conecta la relación con tus clientes, la rentabilidad y el seguimiento comercial y fiscal.</p>
          </div>
          <div className={styles.capabilities}>{capabilities.map((feature) => <article key={feature.number} className={styles.capability}><span className={styles.featureNumber}>{feature.number}</span><div><h3>{feature.title}</h3><p>{feature.description}</p><p className={styles.featureDetail}>{feature.detail}</p></div></article>)}</div>
          <div className={styles.optionsNote}>
            <div><p className={styles.eyebrow}>Cada opción cuenta como corresponde</p><h3>¿Otra versión, una alternativa<br />o algo que se suma?</h3></div>
            <p>Clasifica las propuestas de una oportunidad como revisiones, alternativas o complementos. Compara opciones sin inflar el valor del negocio y conserva el detalle de lo que finalmente se gana.</p>
          </div>
        </section>

        <section className={styles.companySection} aria-labelledby="company-title">
          <div className={`${styles.container} ${styles.companyInner}`}>
            <div><p className={styles.eyebrow}>A la medida de tu empresa</p><h2 id="company-title">Tu equipo.<br />Tu forma de trabajar.</h2><p>Cada empresa tiene su propio espacio, usuarios, permisos y políticas de margen.</p></div>
            <div className={styles.companyDetails}>
              <div><h3>También en la parte fiscal</h3><p>Pagos en una sola exhibición o diferidos, complementos de pago, cancelaciones y sustituciones, según la configuración fiscal habilitada.</p></div>
              <div><h3>Funciones que eliges habilitar</h3><p>La importación de cotizaciones PDF de ThreatDown y la evidencia comercial son opcionales por empresa. Tú decides si conservas cada PDF como respaldo.</p></div>
              <p className={styles.pilotNote}>La vista CRM ampliada está en piloto con acceso restringido; su habilitación se administra por empresa.</p>
            </div>
          </div>
        </section>

        <section className={`${styles.closing} ${styles.container}`} aria-labelledby="closing-title">
          <p className={styles.eyebrow}>Todo listo para continuar</p><h2 id="closing-title">Tu próximo buen negocio<br />empieza con <em>claridad.</em></h2>
          <Link className={styles.primaryButton} href="/inicio">Ir a mi espacio de trabajo <Arrow /></Link>
        </section>
      </main>
      <footer className={styles.footer}><div className={`${styles.container} ${styles.footerInner}`}><CotizaBrand compact href="/" /><p>Cotiza · Una solución de DynamiQuote</p><a href="#contenido">Volver arriba <span aria-hidden="true">↑</span></a></div></footer>
    </div>
  );
}
