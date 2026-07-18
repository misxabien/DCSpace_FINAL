"use client";

import type { EventGalleryPhoto } from "@/lib/organizedEventGallery";
import styles from "@/components/organized/OrganizedDetail.module.css";

export function EventGallerySection({ photos }: { photos: EventGalleryPhoto[] }) {
  if (!photos.length) return null;

  return (
    <section className={styles.gallerySection} aria-labelledby="event-gallery">
      <h3 id="event-gallery">Event Gallery</h3>
      <div className={styles.galleryGrid}>
        {photos.map((photo) => (
          <figure key={photo.id} className={styles.galleryItem}>
            <img src={photo.dataUrl} alt="Event gallery upload" />
          </figure>
        ))}
      </div>
    </section>
  );
}
