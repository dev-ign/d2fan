export interface EmailTemplate {
  subject: string;
  text: string;
}
export function template(
  kind: string,
  lang: string,
  links: string[],
  support: string,
): EmailTemplate {
  const es = lang === "es";
  const content: Record<string, [string, string]> = {
    capture: es
      ? [
          "Tu exclusivo de Jona",
          "Gracias por acercarte. Aquí está tu exclusivo. Si elegiste novedades, confirma tu permiso con el enlace de abajo.",
        ]
      : [
          "Your exclusive from Jona",
          "Thanks for getting close. Here’s your exclusive. If you chose music updates, confirm your permission using the link below.",
        ],
    welcome: es
      ? [
          "Bienvenido a La Cultura",
          "Ya eres parte. Nueva música y cosas que no comparto en ningún otro lugar. Gracias por estar aquí. — Jona",
        ]
      : [
          "Welcome to La Cultura",
          "You’re in. New music and things I don’t share anywhere else. Thanks for being here. — Jona",
        ],
    purchase: es
      ? [
          "Gracias por apoyar a Jona",
          "Tu pago está confirmado. Si compraste contenido del Vault, el enlace privado está abajo. Pide un nuevo enlace en la web si caduca.",
        ]
      : [
          "Thanks for supporting Jona",
          "Your payment is confirmed. If you purchased Vault content, your private link is below. Request a fresh link on the website if it expires.",
        ],
    recovery: es
      ? [
          "Tu acceso al Vault",
          "Estos son los enlaces privados para tus compras activas. Caducan en 48 horas; puedes pedir otros.",
        ]
      : [
          "Your Vault access",
          "Here are private links for your active purchases. They expire in 48 hours; you can request new ones.",
        ],
    reminder: es
      ? [
          "Tu apoyo sigue aquí",
          "Dejaste un checkout sin terminar. Si todavía quieres apoyar, puedes volver al sitio. Sin presión. — Jona",
        ]
      : [
          "Your support is still here",
          "You left a checkout unfinished. If you still want to support, you can return to the site. No pressure. — Jona",
        ],
  };
  const [subject, body] = content[kind] || content.purchase;
  return {
    subject,
    text: `${body}\n\n${links.join("\n\n")}\n\n${es ? "Ayuda" : "Support"}: ${support}`,
  };
}
