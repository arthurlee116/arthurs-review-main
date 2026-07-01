"use client";

import { useEffect, useRef, useState } from "react";
import { CONTACT_NOTICE } from "@/components/ContactNotice";

const CONTACT_PROMPT_SEEN_KEY = "arthurs-review.contactPromptSeen";

function hasSeenContactPrompt() {
  try {
    return window.localStorage?.getItem(CONTACT_PROMPT_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberContactPrompt() {
  try {
    window.localStorage?.setItem(CONTACT_PROMPT_SEEN_KEY, "1");
  } catch {}
}

export function ContactPromptModal() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  function close() {
    rememberContactPrompt();
    setIsOpen(false);
  }

  useEffect(() => {
    const openTimer = window.setTimeout(() => {
      if (!hasSeenContactPrompt()) setIsOpen(true);
    }, 0);

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(openTimer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (dialog.open) return;
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
      return;
    }

    if (dialog.open && typeof dialog.close === "function") dialog.close();
    dialog.removeAttribute("open");
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="contact-modal-title"
      className="contact-modal-panel"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div className="contact-modal-accent" />
      <p id="contact-modal-title" className="sans contact-modal-kicker">
        留言
      </p>
      <p className="contact-modal-copy">{CONTACT_NOTICE}</p>
      <button className="sans contact-modal-close" type="button" onClick={close}>
        关闭
      </button>
    </dialog>
  );
}
