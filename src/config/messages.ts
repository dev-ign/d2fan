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
    joined:
      "You’re captured. Check your email for delivery and, if selected, confirmation of music updates.",
    pending:
      "Your contact is saved. The exclusive is still being prepared; delivery is pending.",
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
    joined:
      "Guardamos tu contacto. Revisa tu correo para la entrega y, si elegiste novedades, la confirmación.",
    pending:
      "Guardamos tu contacto. Estamos preparando el exclusivo; la entrega está pendiente.",
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
