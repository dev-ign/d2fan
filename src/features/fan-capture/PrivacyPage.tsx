import { useLocale, text } from "../../hooks/useLocale";

const updated = new Date("2026-11-18T12:00:00Z");

export function PrivacyPage() {
  const {
    locale,
    t: { privacy },
  } = useLocale();
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(updated);

  return (
    <main className="release-page" aria-labelledby="privacy-title">
      <div className="container">
        <article className="privacy-policy">
          <h1 id="privacy-title" className="display-heading">
            {privacy.title}
          </h1>
          <p className="privacy-effective">
            {text(privacy.effective, { date })}
          </p>
          <p>{privacy.operator}</p>
          <section>
            <h2>{privacy.signupTitle}</h2>
            <p>{privacy.signup}</p>
          </section>
          <section>
            <h2>{privacy.purchasesTitle}</h2>
            <p>{privacy.purchases}</p>
          </section>
          <section>
            <h2>{privacy.measurementTitle}</h2>
            <p>{privacy.measurement}</p>
          </section>
          <section>
            <h2>{privacy.retentionTitle}</h2>
            <p>{privacy.retention}</p>
            <a href="https://www.instagram.com/jonaferreira/">
              {privacy.contact}
            </a>
          </section>
        </article>
      </div>
    </main>
  );
}
