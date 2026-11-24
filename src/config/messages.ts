import { english, spanish } from "../i18n/site";
const formMessages = {
  en: {
    amount: "Choose an amount",
    email: "Your email",
    emailOptIn:
      "Email me new music and updates. Confirm by email; unsubscribe anytime.",
    whatsapp: "WhatsApp delivery is being prepared. Choose email for now.",
    next: "CONTINUE",
    back: "BACK",
    pay: "CONTINUE TO STRIPE",
    saving: "SAVING…",
    invalid: "Enter a valid email address.",
    saved: "Your contact is saved. Continue to Stripe for secure payment.",
    rewardRequested: "Wallpaper request saved.",
    updatesRequested: "Music updates requested.",
    captureSaved: "We saved your request for the Acción wallpaper.",
    rewardUnavailable:
      "The wallpaper is temporarily unavailable. Try again later to get your download.",
    rewardEmailQueued:
      "Your wallpaper email is queued. Check your inbox and spam folder in a few minutes.",
    rewardEmailAccepted:
      "Check your inbox and spam folder for the wallpaper link.",
    rewardReady: "Your exclusive Acción wallpaper is ready to download.",
    rewardDownload: "Download Acción wallpaper",
    marketingConfirmation:
      "Your confirmation email is queued. When it arrives, open it and select Confirm request to subscribe.",
    marketingConfirmationDisabled:
      "Email delivery is currently disabled. You can make a fresh request for music updates when email is available.",
    marketingConfirmationAccepted:
      "Check your inbox and spam folder, then select Confirm request in the email to subscribe.",
    marketingConfirmationFailed:
      "The confirmation email couldn’t be sent. Try signing up again later to request a new link.",
    marketingConfirmationQuarantined:
      "Your confirmation email is on hold. To subscribe, try signing up again later for a new link.",
    marketingConfirmationSkipped:
      "Your confirmation email was skipped. To subscribe, try signing up again later for a new link.",
    marketingConfirmationUnknown:
      "We couldn’t verify email delivery. If the confirmation email arrives, select Confirm request to subscribe.",
    marketingNotRequested: "You requested the wallpaper only.",
    captureConflict: "Please try again to start a fresh wallpaper request.",
    captureRateLimit: "Please wait a minute before trying again.",
    captureRetry: "Back to the form",
    tax: "Your contribution is a tip to the artist, with no charitable donation status or tax deduction. Vault access and mailing-list signup are separate.",
    refund:
      "Digital access is delivered after confirmed payment. Contact the artist for refund requests; a full refund revokes access. Your statutory rights apply.",
    support:
      "Make a voluntary contribution to Jona Ferreira’s independent music and creative work.",
    unavailable: "This piece is being prepared. Paid access is not open yet.",
    amountError:
      "Choose an amount from $5 to $1,000, with up to two decimal places.",
    requestError:
      "Could not complete this request. Your details are still here; please try again.",
  },
  es: {
    amount: "Elige una cantidad",
    email: "Tu correo",
    emailOptIn:
      "Quiero recibir música y novedades por correo. Confirma por email; cancela cuando quieras.",
    whatsapp: "Estamos preparando WhatsApp. Por ahora, elige correo.",
    next: "CONTINUAR",
    back: "ATRÁS",
    pay: "CONTINUAR A STRIPE",
    saving: "GUARDANDO…",
    invalid: "Introduce un correo válido.",
    saved:
      "Guardamos tu contacto. Continúa a Stripe para pagar de forma segura.",
    rewardRequested: "Solicitud del wallpaper guardada.",
    updatesRequested: "Solicitud de novedades recibida.",
    captureSaved: "Guardamos tu solicitud del wallpaper de Acción.",
    rewardUnavailable:
      "El wallpaper no está disponible en este momento. Inténtalo más tarde para descargarlo.",
    rewardEmailQueued:
      "El correo del wallpaper está en cola. Revisa tu bandeja de entrada y la carpeta de correo no deseado en unos minutos.",
    rewardEmailAccepted:
      "Busca el enlace al wallpaper en tu bandeja de entrada o en la carpeta de correo no deseado.",
    rewardReady: "Tu wallpaper exclusivo de Acción está listo para descargar.",
    rewardDownload: "Descargar wallpaper de Acción",
    marketingConfirmation:
      "El correo de confirmación está en cola. Cuando llegue, ábrelo y selecciona Confirmar solicitud para suscribirte.",
    marketingConfirmationDisabled:
      "El envío de correo está desactivado. Puedes volver a solicitar las novedades cuando el correo esté disponible.",
    marketingConfirmationAccepted:
      "Revisa tu bandeja de entrada y la carpeta de correo no deseado. Selecciona Confirmar solicitud en el correo para suscribirte.",
    marketingConfirmationFailed:
      "No se pudo enviar el correo de confirmación. Intenta registrarte de nuevo más tarde para solicitar otro enlace.",
    marketingConfirmationQuarantined:
      "El correo de confirmación está retenido. Para suscribirte, vuelve a registrarte más tarde para obtener otro enlace.",
    marketingConfirmationSkipped:
      "Se omitió el correo de confirmación. Para suscribirte, vuelve a registrarte más tarde para obtener otro enlace.",
    marketingConfirmationUnknown:
      "No pudimos verificar el envío. Si te llega el correo, selecciona Confirmar solicitud para suscribirte.",
    marketingNotRequested: "Solo solicitaste el wallpaper.",
    captureConflict:
      "Vuelve a intentarlo para iniciar una nueva solicitud del wallpaper.",
    captureRateLimit: "Espera un minuto antes de volver a intentarlo.",
    captureRetry: "Volver al formulario",
    tax: "Tu aporte es una propina para el artista, sin carácter de donación benéfica ni derecho a una deducción fiscal. El acceso a Vault y la suscripción a la lista de correo son independientes.",
    refund:
      "El acceso digital se entrega tras confirmar el pago. Contacta al artista para pedir un reembolso; un reembolso total revoca el acceso. Se respetan tus derechos legales.",
    support:
      "Haz un aporte voluntario a la música independiente y al trabajo creativo de Jona Ferreira.",
    unavailable: "Estamos preparando esta pieza. Todavía no está a la venta.",
    amountError: "Elige entre $5 y $1,000, con un máximo de dos decimales.",
    requestError:
      "No se pudo completar. Tus datos siguen aquí; inténtalo otra vez.",
  },
};

export const messages = {
  en: { ...formMessages.en, ...english },
  es: { ...formMessages.es, ...spanish },
} satisfies Record<"en" | "es", typeof formMessages.en & typeof english>;
