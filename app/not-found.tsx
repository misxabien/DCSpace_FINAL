import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <main className={styles.page}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/404-illustration.svg"
        alt="404 page not found"
        width={806}
        height={554}
        className={styles.illustration}
      />

      <p className={styles.message}>
        Oops! The page you&apos;re looking for could not be found.
      </p>

      <Link href="/home" className={styles.button}>
        <span className={styles.arrow} aria-hidden="true">
          ←
        </span>
        BACK TO DC SPACE
      </Link>
    </main>
  );
}
