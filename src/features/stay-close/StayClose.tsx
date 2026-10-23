import { FanCaptureForm } from "../fan-capture/FanCaptureForm";

export function StayClose() {
  return (
    <section
      className="stay-section"
      id="stay-close"
      aria-labelledby="stay-title"
    >
      <div className="container stay-content">
        <div className="section-intro stay-intro reveal">
          <h2 id="stay-title" className="editorial-heading">
            <span>STAY</span>
            <em>CLOSE.</em>
          </h2>
          <p>
            New music, unreleased drops, and a few things I don't share anywhere
            else. Straight from me to you.
          </p>
        </div>
        <p className="incentive">
          <img src="/assets/gift.svg" alt="" width="24" height="24" /> Exclusive
          Acción wallpaper when you join.
        </p>
        <FanCaptureForm />
        <div className="reward-art" aria-hidden="true">
          <img src="/assets/raw-stay-1.webp" alt="" />
        </div>
        <footer className="site-footer">
          <span className="sr-only">
            Jona Ferreira — independent music, direct to you.
          </span>
        </footer>
      </div>
    </section>
  );
}
