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
    culturaTitle: "You're in La Cultura.",
    captureSaved: "Your contact is saved. Thanks for being part of this.",
    rewardUnavailable:
      "Your exclusive is still being prepared. It isn’t available to download yet.",
    rewardReady: "Your exclusive Acción wallpaper is ready to download.",
    rewardDownload: "Download Acción wallpaper",
    marketingConfirmation:
      "You requested music updates. A confirmation email is queued; marketing requires your separate confirmation.",
    marketingConfirmationDisabled:
      "You requested music updates. Email delivery is currently disabled, so no confirmation email is being sent. Marketing permission has not been granted by this request.",
    marketingConfirmationAccepted:
      "You requested music updates. The provider accepted the confirmation email; marketing requires your separate confirmation.",
    marketingConfirmationFailed:
      "You requested music updates. Confirmation email delivery failed; this request does not confirm marketing permission.",
    marketingConfirmationQuarantined:
      "You requested music updates. The confirmation email is on hold and will not be retried automatically; this request does not confirm marketing permission.",
    marketingConfirmationSkipped:
      "You requested music updates. The confirmation email was skipped; this request does not confirm marketing permission.",
    marketingConfirmationUnknown:
      "You requested music updates. Confirmation email delivery status is unavailable; this request does not confirm marketing permission.",
    marketingNotRequested:
      "You didn’t request music updates with this signup. Your existing preferences stay the same.",
    tax: "Support is a tip / payment to the artist — not a charitable donation, and not tax-deductible.",
    refund:
      "Digital access is delivered after confirmed payment. Contact the artist for refund requests; a full refund revokes access. Your statutory rights apply.",
    support:
      "Every contribution goes directly toward creating and releasing independent music.",
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
    culturaTitle: "Ya eres parte de La Cultura.",
    captureSaved: "Guardamos tu contacto. Gracias por ser parte de esto.",
    rewardUnavailable:
      "Estamos preparando tu exclusivo. Todavía no está disponible para descargar.",
    rewardReady: "Tu wallpaper exclusivo de Acción está listo para descargar.",
    rewardDownload: "Descargar wallpaper de Acción",
    marketingConfirmation:
      "Pediste novedades musicales. La confirmación por correo está en cola; las novedades requieren tu confirmación por separado.",
    marketingConfirmationDisabled:
      "Pediste novedades musicales. El envío de correo está desactivado, por lo que no se está enviando una confirmación. Esta solicitud no ha otorgado permiso de marketing.",
    marketingConfirmationAccepted:
      "Pediste novedades musicales. El proveedor aceptó el correo de confirmación; las novedades requieren tu confirmación por separado.",
    marketingConfirmationFailed:
      "Pediste novedades musicales. Falló el envío del correo de confirmación; esta solicitud no confirma el permiso de marketing.",
    marketingConfirmationQuarantined:
      "Pediste novedades musicales. El correo de confirmación está retenido y no se reintentará automáticamente; esta solicitud no confirma el permiso de marketing.",
    marketingConfirmationSkipped:
      "Pediste novedades musicales. Se omitió el correo de confirmación; esta solicitud no confirma el permiso de marketing.",
    marketingConfirmationUnknown:
      "Pediste novedades musicales. El estado del envío del correo de confirmación no está disponible; esta solicitud no confirma el permiso de marketing.",
    marketingNotRequested:
      "No pediste novedades musicales con este registro. Tus preferencias anteriores siguen igual.",
    tax: "El apoyo es un pago al artista, no una donación benéfica ni deducible de impuestos.",
    refund:
      "El acceso digital se entrega tras confirmar el pago. Contacta al artista para pedir un reembolso; un reembolso total revoca el acceso. Se respetan tus derechos legales.",
    support: "Cada aporte ayuda a crear y publicar música independiente.",
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
