import type { ContentFields } from "../../../supabase/shared/studio-content";

export const contentPillars = [
  "Song storytelling",
  "Studio process",
  "Songwriting",
  "Performance",
  "Music visualizer",
  "Artistic identity",
  "Artist reflections",
  "Collaboration",
  "Release announcement",
  "Fan engagement",
  "Exclusive music",
  "Catalog rediscovery",
];

export const contentIdeas = [
  {
    title: "Lead with the hook",
    pillar: "Performance",
    direction:
      "Record one uninterrupted vertical take of the strongest musical moment.",
    en: [
      "This is the part I keep coming back to.",
      "Play this part back if it sticks with you.",
      "Hear the song on my site.",
    ],
    es: [
      "Esta es la parte a la que siempre vuelvo.",
      "Si se te queda en la cabeza, ponla otra vez.",
      "Escucha la canción en mi web.",
    ],
  },
  {
    title: "Tell the story behind a line",
    pillar: "Song storytelling",
    direction:
      "Talk about one line in your own words, then let the music finish the story.",
    en: [
      "There’s a story behind this line.",
      "There’s always more to a lyric than makes it into the song. What line stayed with you?",
      "Hear the preview on my site.",
    ],
    es: [
      "Esta línea tiene su historia.",
      "Siempre hay algo de una letra que se queda fuera de la canción. ¿Qué línea se te quedó?",
      "Escucha el adelanto en mi web.",
    ],
  },
  {
    title: "Show a studio decision",
    pillar: "Studio process",
    direction:
      "Play two versions of a small change from the same session. Ask which one lands.",
    en: [
      "One small change can shift the whole song.",
      "A or B? Which version would you keep?",
      "Listen to the song on my site.",
    ],
    es: [
      "Un detalle puede cambiar toda la canción.",
      "¿A o B? ¿Con cuál te quedas?",
      "Escucha la canción en mi web.",
    ],
  },
  {
    title: "Invite listeners to La Cultura",
    pillar: "Fan engagement",
    direction:
      "Use a short clip to invite listeners to the release page and its La Cultura reward.",
    en: [
      "If the song found you, come a little closer.",
      "I’m building La Cultura for the people who want to come closer to the music.",
      "Explore La Cultura on my site.",
    ],
    es: [
      "Si la canción te encontró, acércate un poco más.",
      "Estoy creando La Cultura para quienes quieren estar más cerca de la música.",
      "Conoce La Cultura en mi web.",
    ],
  },
  {
    title: "Introduce the release in a Story",
    pillar: "Release announcement",
    format: "ig_story",
    direction:
      "Record a 10–15 second introduction and add a distinct Link sticker to the release page.",
    en: [
      "Here’s a song I want you to hear.",
      "A little of what I’ve been making.",
      "Tap to hear the preview.",
    ],
    es: [
      "Quiero que escuches esta canción.",
      "Un poquito de lo que he estado haciendo.",
      "Toca para escuchar el adelanto.",
    ],
  },
  {
    title: "Make a late-night drive teaser",
    pillar: "Music visualizer",
    format: "ig_reel",
    direction:
      "Pair 10–15 seconds of approved audio with night footage you own. Keep the strongest musical moment up front.",
    en: [
      "For the late-night drive.",
      "Play this one after dark.",
      "Find the song on my site.",
    ],
    es: [
      "Para cuando cae la noche.",
      "Pon esta cuando oscurezca.",
      "Encuentra la canción en mi web.",
    ],
  },
  {
    title: "Prepare a collaborator Story",
    pillar: "Collaboration",
    format: "ig_story",
    direction:
      "If a collaborator agrees, prepare a 15-second Story and a distinct tracked link for their audience.",
    en: [
      "One for your headphones.",
      "A moment from the song for anyone hearing it for the first time.",
      "Tap to hear the preview.",
    ],
    es: [
      "Una para los audífonos.",
      "Un pedacito para quienes la escuchan por primera vez.",
      "Toca para escuchar el adelanto.",
    ],
  },
] as const;

export function ideaCopy(
  idea: (typeof contentIdeas)[number],
  language: ContentFields["language"],
  song?: string,
) {
  const [hook, caption, cta] =
    language === "bilingual"
      ? idea.en.map((line, index) => `${line}\n${idea.es[index]}`)
      : idea[language];
  return {
    hook: hook.replace("\n", " / "),
    caption: song ? `${song}\n\n${caption}` : caption,
    cta: cta.replace("\n", " / "),
  };
}
