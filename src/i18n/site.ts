import { artist } from "../data/content";

export const english = {
  meta: {
    title: "Jona Ferreira — Music for Every Mood",
    description:
      "Jona Ferreira — music for every mood. Discover the releases, go behind the music, and stay close.",
  },
  nav: {
    sections: {
      music: "Music",
      vault: "The Vault",
      "stay-close": "Stay close",
    },
    main: "Main navigation",
    site: "Site navigation",
    support: "SUPPORT THE MUSIC",
    changeLanguage: "Change language",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    note: "Independent music. Direct to you.",
  },
  common: {
    close: "Close dialog",
    select: "Select {title}",
    cover: "{title} cover art",
    single: "Single",
    comingSoon: "coming soon",
    unlock: "unlock",
    notFound: "PAGE NOT FOUND.",
    home: "Go home",
  },
  hero: {
    short: artist.biography.short,
    full: artist.biography.full,
    readBio: "Read artist biography",
    latest: "LATEST RELEASE",
    latestLabel: "Latest release: {title}",
    about: "About Jona Ferreira",
    explore: "EXPLORE THE MUSIC",
    socials: "Find Jona online",
    follow: "FOLLOW JONA EVERYWHERE",
    socialSearch: "Search for Jona Ferreira on {platform}",
    socialArtist: "Jona Ferreira on {platform}",
  },
  bio: {
    carousel: "carousel",
    gallery: "Artist photo gallery",
    portrait: "Jona Ferreira portrait",
    previous: "Previous portrait view",
    next: "Next portrait view",
    slide: "Photo {current} of {total}",
  },
  music: {
    first: "THE",
    second: "MUSIC.",
    listen: "Listen on",
    releasePage: "Release page",
    artwork: "Release artwork carousel",
    previous: "Previous release",
    next: "Next release",
    choose: "Choose a release",
    play: "Play {title} preview",
    pause: "Pause {title} preview",
    loading: "Loading {title} preview",
    retry: "Retry {title} preview",
    chipLoading: "LOADING PREVIEW",
    chipError: "PREVIEW UNAVAILABLE",
    chipPlaying: "NOW PLAYING",
    chipPaused: "PREVIEW PAUSED",
  },
  player: {
    open: "Open audio player",
    loading: "Loading preview",
    retry: "Retry preview",
    pause: "Pause preview",
    play: "Play preview",
    position: "Playback position",
    metadata: "Jona Ferreira · 30-second preview",
    empty: "Choose a release below to hear a preview.",
    failed: "This preview could not be played.",
    unavailable: "A preview is not available for this release.",
    blocked: "Playback was blocked or the preview is unavailable. Try again.",
  },
  release: {
    missing: "RELEASE NOT FOUND",
    notFirst: "NOT",
    notSecond: "HERE.",
    back: "Back to music",
    listen: "Listen to this release",
    listenOn: "Listen to {title} on {service}",
    stay: "Stay",
    close: "close.",
  },
  vault: {
    first: "THE",
    second: "VAULT.",
    intro:
      "Your support goes a long way. And for that you get to own a piece of the process. These exclusive items are only available to you and have not been seen by the world.",
    tail: "+ 14 more in the archive · stems, lyric sheets, alternate versions, limited merch",
    rest: "See the rest of the vault.",
    archive: "The Vault archive",
    more: "MORE IS",
    coming: "COMING.",
    preparing:
      "The remaining archive items are being prepared. The four pieces shown on this page are previews; access and fulfillment will open when secure checkout is ready.",
    items: {
      "untitled-demo": {
        title: "UNTITLED DEMO",
        label: "UNRELEASED",
        description: "Voice memo → studio · ▮▮:▮▮",
      },
      "cafe-studio": {
        title: "CAFÉ — IN THE STUDIO",
        label: "BEHIND THE SONG",
        description: "Session footage · ▮▮ min",
      },
      "accion-wallpaper": {
        title: "Acción — hi-res artwork & wallpapers",
        label: "DOWNLOAD",
        description: "Hi-res artwork & wallpapers",
      },
      "shorty-cut": {
        title: "Shorty — extended video",
        label: "DIRECTOR’S CUT",
        description: "Extended video",
      },
    },
  },
  stay: {
    first: "STAY",
    second: "CLOSE.",
    heroCta: "Join the Culture",
    rewardCta: "Get the free Acción wallpaper",
    intro:
      "Get closer to Jona Ferreira’s music. Take home exclusive artwork and choose whether to hear about new releases by email.",
    releaseIntro:
      "Take a piece of Acción with you. Get the exclusive wallpaper and choose whether to get release updates from Jona.",
    incentive: "Free, exclusive Acción wallpaper.",
    footer: "Jona Ferreira — independent music, direct to you.",
  },
  forms: {
    emailLabel: "YOUR EMAIL",
    placeholder: "you@email.com",
    join: "JOIN LA CULTURA",
    disclosure:
      "We use your email to fulfill the wallpaper request. The checkbox is optional. If you select it, confirm music updates by email.",
    channel: "Delivery channel",
    email: "Email",
    whatsapp: "WhatsApp · coming soon",
    custom: "Custom amount (USD)",
  },
  supportUI: {
    dialog: "Support the journey",
    tipDialog: "Support the Music",
    first: "SUPPORT",
    second: "JONA.",
    vaultFirst: "THE",
    vaultSecond: "VAULT.",
    title: "Support Jona",
    operator: "Stripe test mode · authorized operator · no real charge",
    checkoutNote:
      "One-time payment in USD. Refund requests are reviewed individually.",
    paymentHelp: "Email for payment help or refunds",
    refundPolicyTitle: "Payment and refund policy",
    refundPolicy:
      "You can leave Stripe Checkout before confirming payment. Contact the artist about accidental, duplicate or unauthorized payments or other refund concerns. We review requests fairly under applicable consumer protection and payment-provider rules. Refunds depend on the circumstances.",
  },
  privacy: {
    title: "Privacy Policy",
    description:
      "How Jona Ferreira uses your information and how to manage your privacy choices.",
    effective: "Updated {date}. Effective when published.",
    operator:
      "Jona Ferreira operates jonaferreira.com. This policy covers how the site handles your information when you listen, join La Cultura, request access or support the artist.",
    signupTitle: "Signups, rewards and email",
    signup:
      "When you sign up, we collect your email address, preferred language and signup source. We use this information to save your signup and provide the reward you requested when available. We use Resend to deliver requested emails. If you separately ask for music and release updates, we record that request and require you to confirm it by email before granting marketing permission. Promotional sending is currently disabled. You can withdraw permission using the unsubscribe link in marketing emails.",
    purchasesTitle: "Purchases and downloads",
    purchases:
      "When checkout is available, Stripe handles payment details and collects your email for guest contributions. We keep the transaction references, amount and status needed to confirm and reconcile contributions. For Vault purchases, we keep the purchase, contact and access records needed to deliver downloads and help you recover access. Supabase stores site records and hosts private files. The site verifies access before issuing temporary links to those files.",
    measurementTitle: "Browser settings and measurement",
    measurement:
      "The site remembers your language and measurement choice in your browser. If you allow campaign measurement in the footer, the site can share activity with Meta, including page visits, preview starts, streaming link clicks, signup form views and starts, and campaign conversions. These events can include the release, page placement and site language. You can turn measurement off there at any time. Music links take you to other services, whose privacy policies apply on their sites.",
    retentionTitle: "Retention and your choices",
    retention:
      "We keep signup, consent and access records as needed to provide the services you request, honor unsubscribes, account for purchases and meet legal obligations. To request access, correction or deletion, reply to a site email or contact Jona Ferreira through the artist’s official Instagram account. We may verify that you control the email address before acting on a request.",
    contact: "Contact Jona Ferreira on Instagram",
    allow: "Allow campaign measurement with Meta",
    optional: "Optional. Music and purchases work either way.",
    error:
      "Browser measurement is off. Could not update queued server events; reconnect and toggle off again to retry.",
  },
  transaction: {
    recover: "Already purchased? Recover access",
    dialog: "Your purchase and access",
    tipTitle: "Your contribution",
    direct: "DIRECT FROM JONA",
    first: "STAY",
    second: "CLOSE.",
    verifying: "Verifying your payment…",
    confirmed: "Payment confirmed. Thank you for supporting Jona.",
    refunded: "This payment was refunded.",
    expired:
      "This checkout expired. Start a new checkout whenever you’re ready.",
    failed: "Payment could not be completed. You can try again.",
    canceled:
      "Checkout was canceled. No download is unlocked. You can resume payment below.",
    tipCanceled:
      "You canceled checkout. If you already submitted a payment, check its status before trying again.",
    waiting:
      "Waiting for verified payment confirmation. This may take a moment.",
    check: "CHECK PAYMENT AGAIN",
    testSaved: "Your test purchase is saved. Download your package below.",
    sent: "The provider accepted your access email.",
    queued:
      "Your receipt/access email is queued. Provider acceptance is not yet confirmed. Your purchase stays saved.",
    deliveryDisabled:
      "Email delivery is currently disabled. Your purchase stays saved. Any eligible download remains available here.",
    deliveryFailed:
      "Your receipt/access email failed. Your purchase stays saved. Any eligible download remains available here.",
    deliveryQuarantined:
      "Your receipt/access email is on hold and will not be retried automatically. Your purchase stays saved. Any eligible download remains available here.",
    deliverySkipped:
      "Your receipt/access email was not sent. Your purchase stays saved. Any eligible download remains available here.",
    deliveryUnknown:
      "Email delivery status is unavailable. Your purchase stays saved. Any eligible download remains available here.",
    restart: "START A NEW CHECKOUT",
    resume: "RESUME SECURE PAYMENT",
    checking: "CHECKING…",
    open: "OPEN MY DOWNLOAD",
    confirm: "CONFIRM MUSIC UPDATES",
    unsubscribe: "UNSUBSCRIBE",
    download: "Download {title}",
    unavailable: "Payment access is not available.",
    ready: "Your private download is ready for five minutes.",
    recoverTitle: "Recover your Vault access",
    your: "YOUR",
    vault: "VAULT.",
    instructions:
      "Enter the email used at checkout to request fresh access links. We’ll show whether email recovery is available.",
    email: "Purchase email",
    sending: "REQUESTING…",
    send: "REQUEST ACCESS LINKS",
    recovered:
      "If this email has eligible purchases, the recovery request is saved. Email delivery has not been confirmed.",
    recoveryDisabled:
      "Email recovery is currently disabled. Existing download links still work; no recovery email is being sent.",
    recoveryUnknown:
      "Your recovery request was received. Email delivery status is unavailable.",
    confirmTitle: "Confirm your music updates",
    unsubscribeTitle: "Unsubscribe from music updates",
    consentConfirmed: "Your music updates are confirmed.",
    unsubscribed: "You have unsubscribed from music updates.",
    confirmationInvalid:
      "This confirmation link is no longer valid. To request music updates, sign up again and choose email updates.",
    unsubscribeInvalid:
      "This unsubscribe link has expired or is invalid. Your preferences have not changed.",
  },
};

type StringTree<T> = {
  [K in keyof T]: T[K] extends string ? string : StringTree<T[K]>;
};
export type SiteMessages = StringTree<typeof english>;

export const spanish: SiteMessages = {
  meta: {
    title: "Jona Ferreira — Música para cada momento",
    description:
      "Jona Ferreira — música para cada momento. Descubre sus lanzamientos, conoce el proceso y mantente cerca.",
  },
  nav: {
    sections: {
      music: "Música",
      vault: "El archivo",
      "stay-close": "Mantente cerca",
    },
    main: "Navegación principal",
    site: "Navegación del sitio",
    support: "APOYA LA MÚSICA",
    changeLanguage: "Cambiar idioma",
    openMenu: "Abrir menú",
    closeMenu: "Cerrar menú",
    note: "Música independiente. Directa para ti.",
  },
  common: {
    close: "Cerrar diálogo",
    select: "Seleccionar {title}",
    cover: "Portada de {title}",
    single: "Sencillo",
    comingSoon: "próximamente",
    unlock: "desbloquear",
    notFound: "PÁGINA NO ENCONTRADA.",
    home: "Ir al inicio",
  },
  hero: {
    short:
      "Jona Ferreira es un artista y compositor dominicano-estadounidense nacido y criado en Boston, que crea música para cada momento.",
    full: "Jona Ferreira es un artista y compositor dominicano-estadounidense nacido y criado en Boston, que crea música para cada momento. Entre reguetón, dancehall, bachata, urbano melódico y sonidos latinos más oscuros, su catálogo puede ser romántico, emotivo, enérgico o callejero, según la canción. Su enfoque no consiste en quedarse dentro de un género, sino en capturar una emoción.",
    readBio: "Leer biografía del artista",
    latest: "ÚLTIMO LANZAMIENTO",
    latestLabel: "Último lanzamiento: {title}",
    about: "Sobre Jona Ferreira",
    explore: "EXPLORA LA MÚSICA",
    socials: "Encuentra a Jona en redes",
    follow: "SIGUE A JONA EN TODAS PARTES",
    socialSearch: "Buscar a Jona Ferreira en {platform}",
    socialArtist: "Jona Ferreira en {platform}",
  },
  bio: {
    carousel: "carrusel",
    gallery: "Galería del artista",
    portrait: "Retrato de Jona Ferreira",
    previous: "Retrato anterior",
    next: "Siguiente retrato",
    slide: "Foto {current} de {total}",
  },
  music: {
    first: "LA",
    second: "MÚSICA.",
    listen: "Escuchar en",
    releasePage: "Ver lanzamiento",
    artwork: "Carrusel de portadas",
    previous: "Lanzamiento anterior",
    next: "Siguiente lanzamiento",
    choose: "Elige un lanzamiento",
    play: "Reproducir adelanto de {title}",
    pause: "Pausar adelanto de {title}",
    loading: "Cargando adelanto de {title}",
    retry: "Reintentar adelanto de {title}",
    chipLoading: "CARGANDO ADELANTO",
    chipError: "ADELANTO NO DISPONIBLE",
    chipPlaying: "SONANDO AHORA",
    chipPaused: "ADELANTO EN PAUSA",
  },
  player: {
    open: "Abrir reproductor de audio",
    loading: "Cargando adelanto",
    retry: "Reintentar adelanto",
    pause: "Pausar adelanto",
    play: "Reproducir adelanto",
    position: "Posición de reproducción",
    metadata: "Jona Ferreira · adelanto de 30 segundos",
    empty: "Elige un lanzamiento para escuchar un adelanto.",
    failed: "No se pudo reproducir este adelanto.",
    unavailable: "Este lanzamiento no tiene un adelanto disponible.",
    blocked:
      "La reproducción se bloqueó o el adelanto no está disponible. Inténtalo de nuevo.",
  },
  release: {
    missing: "LANZAMIENTO NO ENCONTRADO",
    notFirst: "NO ESTÁ",
    notSecond: "AQUÍ.",
    back: "Volver a la música",
    listen: "Escucha este lanzamiento",
    listenOn: "Escucha {title} en {service}",
    stay: "Mantente",
    close: "cerca.",
  },
  vault: {
    first: "EL",
    second: "ARCHIVO.",
    intro:
      "Tu apoyo llega lejos. A cambio, puedes llevarte una parte del proceso. Estos exclusivos están disponibles solo para ti y aún no han salido al mundo.",
    tail: "+ 14 más en el archivo · pistas separadas, letras, versiones alternativas y merch limitado",
    rest: "Ver el resto del archivo.",
    archive: "El archivo de Jona",
    more: "PRONTO",
    coming: "HABRÁ MÁS.",
    preparing:
      "Estamos preparando el resto del archivo. Las cuatro piezas de esta página son adelantos; el acceso y la entrega estarán disponibles cuando el pago seguro esté listo.",
    items: {
      "untitled-demo": {
        title: "UNTITLED DEMO",
        label: "INÉDITO",
        description: "Nota de voz → estudio · ▮▮:▮▮",
      },
      "cafe-studio": {
        title: "CAFÉ — EN EL ESTUDIO",
        label: "DETRÁS DE LA CANCIÓN",
        description: "Imágenes de la sesión · ▮▮ min",
      },
      "accion-wallpaper": {
        title: "Acción — portada en alta resolución y fondos de pantalla",
        label: "DESCARGA",
        description: "Portada en alta resolución y fondos de pantalla",
      },
      "shorty-cut": {
        title: "Shorty — video extendido",
        label: "VERSIÓN DEL DIRECTOR",
        description: "Video extendido",
      },
    },
  },
  stay: {
    first: "MANTENTE",
    second: "CERCA.",
    heroCta: "Entra a la Cultura",
    rewardCta: "Consigue el wallpaper gratis de Acción",
    intro:
      "Acércate a la música de Jona Ferreira. Llévate arte exclusivo y elige si quieres enterarte por correo de sus próximos lanzamientos.",
    releaseIntro:
      "Llévate un pedazo de Acción. Consigue el wallpaper exclusivo y elige si quieres recibir novedades de Jona por correo.",
    incentive: "Wallpaper exclusivo de Acción, gratis.",
    footer: "Jona Ferreira — música independiente, directa para ti.",
  },
  forms: {
    emailLabel: "TU CORREO",
    placeholder: "tu@correo.com",
    join: "ÚNETE A LA CULTURA",
    disclosure:
      "Usamos tu correo para entregarte el wallpaper. Marcar la casilla es opcional. Si la marcas, confirma las novedades por correo.",
    channel: "Canal de entrega",
    email: "Correo",
    whatsapp: "WhatsApp · próximamente",
    custom: "Otra cantidad (USD)",
  },
  supportUI: {
    dialog: "Apoya el camino",
    tipDialog: "Apoya la música",
    first: "APOYA A",
    second: "JONA.",
    vaultFirst: "EL",
    vaultSecond: "ARCHIVO.",
    title: "Apoya a Jona",
    operator: "Modo de prueba de Stripe · operador autorizado · sin cobro real",
    checkoutNote:
      "Pago único en USD. Revisamos cada solicitud de reembolso por separado.",
    paymentHelp: "Ayuda con pagos o reembolsos por correo",
    refundPolicyTitle: "Política de pagos y reembolsos",
    refundPolicy:
      "Puedes salir de Stripe Checkout antes de confirmar el pago. Contacta al artista si hiciste un pago por error, si se duplicó, si no lo autorizaste o si tienes otra consulta sobre reembolsos. Revisamos cada solicitud de forma justa, conforme a las normas de protección al consumidor y del proveedor de pagos. Los reembolsos dependen de cada caso.",
  },
  privacy: {
    title: "Política de privacidad",
    description:
      "Cómo Jona Ferreira usa tu información y cómo gestionar tus opciones de privacidad.",
    effective: "Actualizada el {date}. En vigor a partir de su publicación.",
    operator:
      "Jona Ferreira opera jonaferreira.com. Esta política explica cómo el sitio usa tu información cuando escuchas música, te unes a La Cultura, solicitas acceso o apoyas al artista.",
    signupTitle: "Registro, recompensas y correo",
    signup:
      "Cuando te registras, recopilamos tu correo, tu idioma preferido y el origen de tu registro. Usamos estos datos para guardar tu registro y entregarte la recompensa solicitada cuando esté disponible. Usamos Resend para enviar los correos solicitados. Si pides por separado recibir música y novedades sobre lanzamientos, registramos tu solicitud y te pedimos que la confirmes por correo antes de conceder el permiso de marketing. El envío de promociones está desactivado. Puedes retirar tu permiso con el enlace para darte de baja incluido en los correos promocionales.",
    purchasesTitle: "Compras y descargas",
    purchases:
      "Cuando los pagos están disponibles, Stripe gestiona los datos de pago y recopila tu correo para los aportes como invitado. Guardamos las referencias, el importe y el estado de la transacción para confirmar y conciliar los aportes. Para las compras en Vault, guardamos los datos de compra, contacto y acceso necesarios para entregar descargas y ayudarte a recuperar el acceso. Supabase guarda los registros del sitio y aloja archivos privados. El sitio verifica tu acceso antes de generar enlaces temporales a esos archivos.",
    measurementTitle: "Preferencias del navegador y medición",
    measurement:
      "El sitio recuerda tu idioma y tu preferencia de medición en el navegador. Si permites la medición de campañas en el pie de página, el sitio puede compartir actividad con Meta, como visitas, inicios de adelantos, clics en enlaces de música, vistas e inicios del formulario de registro y conversiones de campañas. Los eventos pueden incluir el lanzamiento, la ubicación del formulario o del control en el sitio y el idioma. Puedes desactivarla allí en cualquier momento. Los enlaces de música te llevan a otros servicios, que aplican sus propias políticas de privacidad.",
    retentionTitle: "Conservación de datos y tus opciones",
    retention:
      "Conservamos los datos de inscripción, consentimiento y acceso durante el tiempo necesario para prestar los servicios que solicitas, respetar las bajas, llevar la contabilidad de las compras y cumplir obligaciones legales. Para solicitar acceso, corrección o eliminación, responde a un correo del sitio o contacta a Jona Ferreira a través de la cuenta oficial de Instagram del artista. Es posible que verifiquemos que controlas la dirección de correo antes de tramitar tu solicitud.",
    contact: "Contacta a Jona Ferreira en Instagram",
    allow: "Permitir la medición de campañas con Meta",
    optional:
      "Es opcional. La música y las compras funcionan de cualquier forma.",
    error:
      "La medición del navegador está desactivada. No pudimos actualizar los eventos pendientes del servidor; vuelve a conectarte y desactívala otra vez para reintentar.",
  },
  transaction: {
    recover: "¿Ya compraste? Recupera tu acceso",
    dialog: "Tu compra y acceso",
    tipTitle: "Tu aporte",
    direct: "DIRECTO DE JONA",
    first: "MANTENTE",
    second: "CERCA.",
    verifying: "Verificando tu pago…",
    confirmed: "Pago confirmado. Gracias por apoyar a Jona.",
    refunded: "Este pago fue reembolsado.",
    expired: "Este pago venció. Puedes iniciar uno nuevo cuando quieras.",
    failed: "No se pudo completar el pago. Puedes intentarlo de nuevo.",
    canceled:
      "Cancelaste el pago. No se desbloqueó ninguna descarga. Puedes retomarlo aquí.",
    tipCanceled:
      "Saliste de Stripe Checkout. Si ya enviaste un pago, revisa su estado antes de intentarlo de nuevo.",
    waiting:
      "Esperando la confirmación verificada del pago. Puede tardar un momento.",
    check: "VOLVER A VERIFICAR EL PAGO",
    testSaved: "Guardamos tu compra de prueba. Descarga tu paquete aquí.",
    sent: "El proveedor aceptó tu correo de acceso.",
    queued:
      "Tu correo de recibo y acceso está en cola. El proveedor aún no ha confirmado su aceptación. Tu compra sigue guardada.",
    deliveryDisabled:
      "El envío de correo está desactivado. Tu compra sigue guardada. Si incluye una descarga, puedes abrirla aquí.",
    deliveryFailed:
      "Falló tu correo de recibo y acceso. Tu compra sigue guardada. Si incluye una descarga, puedes abrirla aquí.",
    deliveryQuarantined:
      "Tu correo de recibo y acceso está retenido y no se reintentará automáticamente. Tu compra sigue guardada. Si incluye una descarga, puedes abrirla aquí.",
    deliverySkipped:
      "No se envió tu correo de recibo y acceso. Tu compra sigue guardada. Si incluye una descarga, puedes abrirla aquí.",
    deliveryUnknown:
      "El estado del envío de correo no está disponible. Tu compra sigue guardada. Si incluye una descarga, puedes abrirla aquí.",
    restart: "INICIAR UN PAGO NUEVO",
    resume: "RETOMAR EL PAGO SEGURO",
    checking: "VERIFICANDO…",
    open: "ABRIR MI DESCARGA",
    confirm: "CONFIRMAR NOVEDADES MUSICALES",
    unsubscribe: "CANCELAR SUSCRIPCIÓN",
    download: "Descargar {title}",
    unavailable: "El acceso de este pago no está disponible.",
    ready: "Tu descarga privada está lista durante cinco minutos.",
    recoverTitle: "Recupera tu acceso al archivo",
    your: "TU",
    vault: "ARCHIVO.",
    instructions:
      "Escribe el correo que usaste al pagar para solicitar nuevos enlaces. Te indicaremos si la recuperación por correo está disponible.",
    email: "Correo de la compra",
    sending: "SOLICITANDO…",
    send: "SOLICITAR ENLACES DE ACCESO",
    recovered:
      "Si este correo tiene compras válidas, guardamos la solicitud de recuperación. El envío de correo no se ha confirmado.",
    recoveryDisabled:
      "La recuperación por correo está desactivada. Los enlaces de descarga existentes siguen funcionando; no se está enviando un correo de recuperación.",
    recoveryUnknown:
      "Recibimos tu solicitud de recuperación. El estado del envío de correo no está disponible.",
    confirmTitle: "Confirma tus novedades musicales",
    unsubscribeTitle: "Cancela las novedades musicales",
    consentConfirmed: "Confirmaste las novedades musicales.",
    unsubscribed: "Cancelaste tu suscripción a las novedades musicales.",
    confirmationInvalid:
      "Este enlace de confirmación ya no es válido. Para pedir novedades musicales, vuelve a registrarte y elige recibir novedades por correo.",
    unsubscribeInvalid:
      "Este enlace para cancelar la suscripción caducó o no es válido. Tus preferencias no han cambiado.",
  },
};
