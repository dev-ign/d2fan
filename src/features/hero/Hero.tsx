import { useState } from "react";
import { Link } from "react-router-dom";
import { Ellipsis } from "lucide-react";
import type { Artist, MusicRelease } from "../../domain/types";
import { Dialog } from "../../components/Dialog";
import { BiographyGallery } from "./BiographyGallery";
import { useLocale, text } from "../../hooks/useLocale";
import { HeroVideo } from "./HeroVideo";

export function Hero({
  artist,
  featured,
}: {
  artist: Artist;
  featured: MusicRelease;
}) {
  const [bioOpen, setBioOpen] = useState(false);
  const { t } = useLocale();
  return (
    <>
      <section className="hero" id="top" aria-labelledby="hero-title">
        <HeroVideo />
        <div className="hero-fade" aria-hidden="true" />
        <div className="hero-content">
          <h1 id="hero-title">JONA FERREIRA</h1>
          <div className="hero-bio">
            <p>{t.hero.short}</p>
          </div>
          <button
            className="hero-read icon-button"
            type="button"
            aria-label={t.hero.readBio}
            aria-haspopup="dialog"
            title={t.hero.readBio}
            onClick={() => setBioOpen(true)}
          >
            <Ellipsis size={22} aria-hidden="true" />
          </button>
        </div>
        <Link
          className="featured-card"
          to={`/music/${featured.slug}`}
          aria-label={text(t.hero.latestLabel, { title: featured.title })}
        >
          <img src={featured.coverArt} alt="" width="64" height="64" />
          <span>
            <small>{t.hero.latest}</small>
            <strong>{featured.title}</strong>
          </span>
          <img
            className="featured-arrow"
            src="/assets/arrow-right.svg"
            alt=""
            width="16"
            height="16"
          />
        </Link>
        <SocialStrip />
      </section>
      {bioOpen && (
        <Dialog
          title={t.hero.about}
          onClose={() => setBioOpen(false)}
          className="bio-dialog"
        >
          <BiographyGallery portrait={artist.heroImage} />
          <div className="bio-copy">
            <h2 className="display-heading">
              JONA <em>FERREIRA.</em>
            </h2>
            <p>{t.hero.full}</p>
            <a
              className="button button--outline"
              href="#music"
              onClick={() => setBioOpen(false)}
            >
              {t.hero.explore}
            </a>
          </div>
        </Dialog>
      )}
    </>
  );
}

const socials = [
  {
    label: "Instagram",
    icon: "/assets/instagram.svg",
    href: "https://www.instagram.com/explore/search/keyword/?q=Jona%20Ferreira",
    searchable: true,
  },
  {
    label: "TikTok",
    icon: "/assets/tiktok.svg",
    href: "https://www.tiktok.com/search?q=Jona%20Ferreira",
    searchable: true,
  },
  {
    label: "YouTube",
    icon: "/assets/youtube.svg",
    href: "https://www.youtube.com/results?search_query=Jona+Ferreira",
    searchable: true,
  },
  {
    label: "Spotify",
    icon: "/assets/spotify.svg",
    href: "https://open.spotify.com/search/Jona%20Ferreira",
    searchable: true,
  },
  {
    label: "Apple Music",
    icon: "/assets/apple-music.svg",
    href: "https://music.apple.com/us/artist/jona-ferreira/1213608691",
    searchable: false,
  },
];

export function SocialStrip() {
  const { t } = useLocale();
  return (
    <aside className="social-strip" aria-label={t.hero.socials}>
      <div className="container social-inner">
        <span className="eyebrow">{t.hero.follow}</span>
        <div>
          {socials.map((social) => (
            <a
              key={social.label}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={
                social.searchable
                  ? text(t.hero.socialSearch, { platform: social.label })
                  : text(t.hero.socialArtist, { platform: social.label })
              }
            >
              <img src={social.icon} alt="" width="18" height="18" />
              {social.label}
            </a>
          ))}
        </div>
      </div>
    </aside>
  );
}
