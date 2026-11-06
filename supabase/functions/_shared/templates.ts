export interface EmailTemplate {
  subject: string;
  text: string;
}
export function template(
  kind: string,
  lang: string,
  links: string[],
  support: string,
  options: { magnet?: boolean; confirm?: boolean } = {},
): EmailTemplate {
  const es = lang === "es";
  const content: Record<string, [string, string]> = {
    capture: options.magnet
      ? es
        ? [
            "Tu wallpaper solicitado",
            `Aquí está el wallpaper que solicitaste. El enlace de acceso caduca en 48 horas.${options.confirm ? " Si solicitaste novedades, usa el enlace y el botón para confirmar tu permiso." : " Esta entrega no cambia tus preferencias de correo."}`,
          ]
        : [
            "Your requested wallpaper",
            `Here is the wallpaper you requested. The access link expires in 48 hours.${options.confirm ? " If you requested updates, use the link and button to confirm your permission." : " This delivery does not change your email preferences."}`,
          ]
      : es
        ? [
            "Confirma tu solicitud de correo",
            "Solicitaste recibir novedades por correo. Abre el enlace y pulsa Confirmar para dar tu permiso. Si no lo solicitaste, ignora este mensaje. No se incluye ninguna descarga.",
          ]
        : [
            "Confirm your email request",
            "You requested email updates. Open the link and press Confirm to give permission. If you did not request this, ignore this message. No download is included.",
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
    transactional_test: es
      ? [
          "Prueba de entrega solicitada",
          "Esta es la única prueba de entrega que autorizaste. El enlace de prueba solicitado caduca en 48 horas. Este mensaje no te suscribe a novedades.",
        ]
      : [
          "Your requested delivery test",
          "This is the single delivery test you authorized. The requested test access link expires in 48 hours. This message does not subscribe you to updates.",
        ],
  };
  if (
    !content[kind] ||
    (kind === "capture" && !options.magnet && !options.confirm)
  )
    throw new Error("unsupported_email");
  const [subject, body] = content[kind];
  return {
    subject,
    text: `${body}\n\n${links.join("\n\n")}\n\n${es ? "Ayuda" : "Support"}: ${support}`,
  };
}
