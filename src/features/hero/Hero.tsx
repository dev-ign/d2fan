import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Artist, MusicRelease } from "../../domain/types";
import { Dialog } from "../../components/Dialog";

export function Hero({
  artist,
  featured,
}: {
  artist: Artist;
  featured: MusicRelease;
}) {
  const [bioOpen, setBioOpen] = useState(false);
  const [photo, setPhoto] = useState(0);
  return (
    <>
      <section className="hero" id="top" aria-labelledby="hero-title">
        <img
          className="hero-image"
          src={artist.heroImage}
          alt="Jona Ferreira adjusting his sunglasses"
          fetchPriority="high"
        />
        <div className="hero-fade" />
        <div className="hero-content">
          <h1 id="hero-title">
            JONA FERREIRA<span>MUSIC</span>
          </h1>
          <div className="hero-bio">
            <p>{artist.biography.short}</p>
            <p className="hero-bio-secondary">
              Moving between reggaeton, dancehall, bachata, melodic urbano and
              darker Latin sounds.
            </p>
          </div>
          <button
            className="text-action hero-read"
            type="button"
            onClick={() => setBioOpen(true)}
          >
            READ MORE
          </button>
        </div>
        <Link
          className="featured-card"
          to={`/music/${featured.slug}`}
          aria-label={`NEW SINGLE · OUT NOW ${featured.title}`}
        >
          <img src={featured.coverArt} alt="" width="64" height="64" />
          <span>
            <small>NEW SINGLE · OUT NOW</small>
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
      </section>
      {bioOpen && (
        <Dialog
          title="About Jona Ferreira"
          onClose={() => setBioOpen(false)}
          className="bio-dialog"
        >
          <div className="bio-photo">
            <img
              className={photo === 1 ? "bio-photo--wide" : ""}
              src={artist.heroImage}
              alt="Jona Ferreira portrait"
            />
            <div className="bio-photo-controls">
              <button
                className="icon-button"
                type="button"
                aria-label="Previous portrait view"
                onClick={() => setPhoto((photo + 1) % 2)}
              >
                <ArrowLeft />
              </button>
              <span>0{photo + 1} / 02</span>
              <button
                className="icon-button"
                type="button"
                aria-label="Next portrait view"
                onClick={() => setPhoto((photo + 1) % 2)}
              >
                <ArrowRight />
              </button>
            </div>
          </div>
          <div className="bio-copy">
            <p className="eyebrow red-text">THE ARTIST</p>
            <h2 className="display-heading">
              JONA <em>FERREIRA.</em>
            </h2>
            <p>{artist.biography.full}</p>
            <a
              className="button button--outline"
              href="#music"
              onClick={() => setBioOpen(false)}
            >
              EXPLORE THE MUSIC
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
  return (
    <aside className="social-strip" aria-label="Find Jona online">
      <div className="container social-inner">
        <span className="eyebrow">FOLLOW JONA EVERYWHERE</span>
        <div>
          {socials.map((social) => (
            <a
              key={social.label}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={
                social.searchable
                  ? `Search for Jona Ferreira on ${social.label}`
                  : `Jona Ferreira on ${social.label}`
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
