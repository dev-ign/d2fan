import { useLocale } from "../../hooks/useLocale";
import { FanCaptureForm } from "../fan-capture/FanCaptureForm";

export function StayClose() {
  const { t } = useLocale();
  return (
    <section
      className="stay-section"
      id="stay-close"
      aria-labelledby="stay-title"
    >
      <div className="container stay-content">
        <div className="section-intro stay-intro reveal">
          <h2 id="stay-title" className="editorial-heading">
            <span>{t.stay.first}</span>
            <em>{t.stay.second}</em>
          </h2>
          <p>{t.stay.intro}</p>
        </div>
        <p className="incentive">
          <img src="/assets/gift.svg" alt="" width="24" height="24" />{" "}
          {t.stay.incentive}
        </p>
        <FanCaptureForm />
        <div className="reward-art" aria-hidden="true">
          <img src="/assets/raw-stay-1.webp" alt="" />
        </div>
        <footer className="site-footer">
          <span className="sr-only">{t.stay.footer}</span>
        </footer>
      </div>
    </section>
  );
}
