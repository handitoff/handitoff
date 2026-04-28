import type { Route } from "./+types/session";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { AppShell } from "../components/app-shell";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `Session ${params.code} - handitoff.io` }];
}

export default function Session({ params }: Route.ComponentProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [peerLabel, setPeerLabel] = useState("Paired device");
  const [chosenFiles, setChosenFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    const storedCode = window.sessionStorage.getItem("handitoff.connectedCode");
    const storedPeerLabel = window.sessionStorage.getItem("handitoff.connectedPeerLabel");
    if (storedCode === params.code.toUpperCase() && storedPeerLabel !== null) {
      setPeerLabel(storedPeerLabel);
    }
  }, [params.code]);

  const chooseFiles = () => inputRef.current?.click();
  const readFiles = (files: FileList | null) => {
    setChosenFiles(files === null ? [] : Array.from(files));
  };
  const endSession = () => {
    window.sessionStorage.removeItem("handitoff.connectedCode");
    window.sessionStorage.removeItem("handitoff.connectedPeerLabel");
    navigate("/");
  };

  return (
    <AppShell>
      <main
        className="stage"
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) {
            setDragActive(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          readFiles(event.dataTransfer.files);
        }}
      >
        <section className="hero-panel">
          <div className="section-label">No. 002 - Channel open</div>
          <h1 className="display-title">
            Drop
            <br />
            anything.
          </h1>
          <p className="lede">
            Files dropped here will appear on the paired device. Photos, archives, documents,
            anything you need to hand off.
          </p>
          <div className="drop-strip" aria-label="File drop area">
            <span>{dragActive ? "Release to stage files" : "Drop files anywhere"}</span>
            <span>{params.code}</span>
          </div>
          <div className="panel-actions panel-actions--left">
            <input
              ref={inputRef}
              type="file"
              multiple
              className="visually-hidden"
              onChange={(event) => readFiles(event.target.files)}
              aria-label="Choose files to send"
            />
            <button className="button" type="button" onClick={chooseFiles}>
              Choose files
            </button>
            <button className="button secondary" type="button" onClick={endSession}>
              End session
            </button>
          </div>
        </section>
        <div className="hairline" />
        <aside className="side-panel">
          <div className="panel-head">
            <span>Connected</span>
            <span>02</span>
          </div>
          <div className="device-paired">
            <div className="phone-outline" aria-hidden="true">
              <div className="phone-speaker" />
              <span>✓</span>
            </div>
            <div>
              <h2>{peerLabel}</h2>
              <p>Paired · Same network</p>
            </div>
          </div>
          <div className="transfer-list">
            <div className="progress-row">
              <div className="progress-fill" style={{ width: "0%" }} />
              <span>01 Outbound</span>
              <span>{chosenFiles.length === 0 ? "Empty" : `${chosenFiles.length} ready`}</span>
            </div>
            <div className="progress-row">
              <div className="progress-fill" style={{ width: "0%" }} />
              <span>02 Inbound</span>
              <span>Waiting</span>
            </div>
          </div>
          <div className="panel-foot">
            <span>Encrypted peer-to-peer</span>
            <span>Idle</span>
          </div>
        </aside>
      </main>
    </AppShell>
  );
}
