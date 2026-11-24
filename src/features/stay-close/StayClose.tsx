import { useLocale } from "../../hooks/useLocale";
import { FanCaptureForm } from "../fan-capture/FanCaptureForm";
import { WallpaperPreview } from "../fan-capture/WallpaperPreview";
import { runtime } from "../../config/runtime";

export function StayClose() {
  const { t } = useLocale();
  return (
    <section
      className="stay-section"
      id="stay-close"
      tabIndex={-1}
      aria-labelledby="stay-title"
    >
      <div className="container stay-content">
        <div className="section-intro stay-intro reveal">
          <h2 id="stay-title" className="editorial-heading">
            <span>{t.stay.first}</span>
            <em>{t.stay.second}</em>
          </h2>
          <p>
            {runtime.laCulturaWallpapers ? t.wallpapers.intro : t.stay.intro}
          </p>
        </div>
        <p className="incentive">
          <img src="/assets/gift.svg" alt="" width="24" height="24" />
          {runtime.laCulturaWallpapers ? (
            <span>
              {t.wallpapers.incentive}
              <span className="wallpaper-offer-detail">
                {t.wallpapers.description}
              </span>
            </span>
          ) : (
            t.stay.incentive
          )}
        </p>
        {runtime.laCulturaWallpapers && <WallpaperPreview />}
        <FanCaptureForm />
        {!runtime.laCulturaWallpapers && (
          <div className="reward-art" aria-hidden="true">
            <img src="/assets/raw-stay-1.webp" alt="" />
          </div>
        )}
        <footer className="site-footer">
          <span className="sr-only">{t.stay.footer}</span>
        </footer>
      </div>
    </section>
  );
}
