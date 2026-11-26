"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { UserDisplayNameBridge } from "@/components/legacy/UserDisplayNameBridge";
import { UserNotifBadgeBridge } from "@/components/legacy/UserNotifBadgeBridge";
import {
  applyTopbarAvatar,
  readCachedAccountImages,
} from "@/lib/profile-images";
import { resolveUserDisplayName } from "@/lib/user-api";
import styles from "@/components/faqs/Faqs.module.css";

type FaqItem = {
  question: string;
  steps: string[];
  note?: string;
  reminders?: string[];
};

const FAQS: FaqItem[] = [
  {
    question: "How do I register as a new user?",
    steps: [
      "Click “Register Here”.",
      "Fill in the required information. If you are not affiliated with any organization, you may leave the Organization field blank.",
      "Scan your school ID using the RFID tapper to obtain your RFID Tag Number.",
      "Enter your email address and create your password. Re-enter your password to confirm.",
      "Enter the verification code sent to your registered email.",
      "Read and accept the Terms and Conditions.",
      "Log in using your newly created account.",
    ],
  },
  {
    question: "How do I find and join an event?",
    steps: [
      "Navigate to the Events page.",
      "Browse the available events.",
      "Select the event you want to attend.",
      "Review the event details and requirements.",
      "Click Join This Event at the bottom of the page.",
    ],
    note:
      "Some events require additional files. You must upload the required files before completing your registration. Your submission will be reviewed and approved by the administrator. While waiting for approval, the event will appear on your Home Page as pending.",
  },
  {
    question: "How will my attendance be recorded?",
    steps: [
      "Log in to your DC SPACE account.",
      "Navigate to the Events page.",
      "Select your preferred event and click Join This Event.",
      "Make sure the event appears on your Home Page.",
      "Proceed to the designated RFID attendance station.",
      "Tap your school ID on the Tap In RFID Reader.",
      "Wait until your name appears on the screen. Your attendance time will automatically start recording.",
      "If you need to leave temporarily, tap your ID on the Tap Out RFID Reader.",
      "When you return, tap your ID on the Tap In RFID Reader again.",
      "Before leaving permanently, tap your ID on the Tap Out RFID Reader to complete your attendance record.",
    ],
    reminders: [
      "If an event does not require a specific attendance duration, a successful Tap In is sufficient to confirm your attendance.",
      "You must Tap Out before you can Tap In again.",
      "Always use your registered school ID.",
      "Make sure each RFID transaction is successful.",
    ],
  },
  {
    question: "How do I view and download my certificates?",
    steps: [
      "Navigate to the Certificates page.",
      "View your earned certificates.",
      "Select the certificate you want to view.",
      "Open and download your certificate from the viewing page.",
    ],
    note:
      "Certificates are available once you have completed the required attendance duration and met the event’s certificate requirements.",
  },
];

const DEVELOPERS = [
  {
    name: "Khrystelle Jan Esplana",
    email: "khrystellejan.esplana@sdca.edu.ph",
  },
  {
    name: "Misxa Bien Germino",
    email: "misxabien.germino@sdca.edu.ph",
  },
  {
    name: "Amira Rachel Marqueses",
    email: "amirarachel.marqueses@sdca.edu.ph",
  },
  {
    name: "Gwyneth Ashley Mucio",
    email: "gwynethashley.mucio@sdca.edu.ph",
  },
];

function ChevronIcon() {
  return (
    <svg className={styles.chevron} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FaqsPage() {
  const { user } = useAuth();
  const baseId = useId();
  const [openIndex, setOpenIndex] = useState(0);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    const sync = () => setDisplayName(resolveUserDisplayName(user?.name));
    sync();
    window.addEventListener("dcspace-profile-updated", sync);
    return () => window.removeEventListener("dcspace-profile-updated", sync);
  }, [user?.name]);

  useEffect(() => {
    const { photoUrl } = readCachedAccountImages();
    applyTopbarAvatar(photoUrl);
  }, [user?.name, displayName]);

  return (
    <>
      <main className={`main ${styles.page}`}>
        <div className="main__top">
          <h1 className="main__greeting">FAQs</h1>
          <div className={`main__tools ${styles.tools}`}>
            <span className="main__user-name">{displayName}</span>
            <Link
              className={`tool-btn tool-btn--avatar ${styles.toolBtn}`}
              href="/profile"
              aria-label="Profile"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v2h20v-2c0-3.33-6.67-5-10-5z" />
              </svg>
            </Link>
            <Link
              className={`tool-btn tool-btn--notif ${styles.toolBtn}`}
              href="/notifications"
              aria-label="Notifications"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
              </svg>
            </Link>
            <button
              type="button"
              className={`tool-btn tool-btn--help ${styles.toolBtn} ${styles.toolBtnHelp}`}
              aria-label="Help"
              aria-haspopup="dialog"
              title="Start page tour"
              data-tour-bound="true"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
          </div>
        </div>

        <p className={styles.intro}>
          Getting started with DC SPACE — St. Dominic College of Asia, Academic Year 2026–2027.
        </p>

        <ul className={styles.list} role="list">
          {FAQS.map((faq, index) => {
            const open = openIndex === index;
            const panelId = `${baseId}-panel-${index}`;
            const buttonId = `${baseId}-button-${index}`;
            return (
              <li key={faq.question} className={styles.item} data-open={open ? "true" : "false"}>
                <button
                  id={buttonId}
                  type="button"
                  className={styles.trigger}
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setOpenIndex(open ? -1 : index)}
                >
                  <span className={styles.question}>{faq.question}</span>
                  <ChevronIcon />
                </button>
                {open ? (
                  <div id={panelId} role="region" aria-labelledby={buttonId} className={styles.panel}>
                    <ol className={styles.steps}>
                      {faq.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                    {faq.note ? (
                      <p className={styles.note}>
                        <span className={styles.noteLabel}>Take Note:</span> {faq.note}
                      </p>
                    ) : null}
                    {faq.reminders?.length ? (
                      <div className={styles.reminders}>
                        <p className={styles.remindersTitle}>Additional Reminders:</p>
                        <ul>
                          {faq.reminders.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        <aside className={styles.footer} aria-label="Still have questions">
          <h2 className={styles.footerTitle}>Still have questions?</h2>
          <p className={styles.footerText}>
            If you have further questions or need assistance using DC SPACE, feel free to contact the
            student developers behind this project.
          </p>
          <ul className={styles.contacts}>
            {DEVELOPERS.map((person) => (
              <li key={person.email}>
                <span className={styles.contactName}>{person.name}</span>
                <a className={styles.contactEmail} href={`mailto:${person.email}`}>
                  {person.email}
                </a>
              </li>
            ))}
          </ul>
          <p className={styles.thanks}>Thank you for using DC SPACE!</p>
          <Link href="/feedback" className={styles.footerLink}>
            Submit a Feedback
          </Link>
        </aside>
      </main>
      <UserDisplayNameBridge />
      <UserNotifBadgeBridge />
    </>
  );
}
