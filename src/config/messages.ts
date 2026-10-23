import type { Language } from "../../supabase/shared/contracts";
export function suggestedLanguage(): Language {
  return navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}
export const messages = {
  en: {
    amount: "Choose an amount",
    contact: "Your details",
    payment: "Secure payment",
    email: "Your email",
    language: "Language",
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
      "You requested music updates. A separate email confirmation is required before marketing begins.",
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
    contact: "Tus datos",
    payment: "Pago seguro",
    email: "Tu correo",
    language: "Idioma",
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
      "Pediste novedades musicales. Se requiere una confirmación por correo antes de empezar a enviarlas.",
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
