import React from "react";
import { LETTERHEAD } from "../../../shared/letterhead.js";

export default function Letterhead({ className = "desi-letterhead", logoSrc = LETTERHEAD.logo }) {
  return (
    <div className={className}>
      <img src={logoSrc} alt="Desi Dawat logo" />
      <h1>{LETTERHEAD.name}</h1>
      <p>{LETTERHEAD.finnish}</p>
      <p>{LETTERHEAD.english}</p>
      <p>{LETTERHEAD.address}</p>
      <p>Puh. / Tel. {LETTERHEAD.phone}</p>
      <p>Email: {LETTERHEAD.email}</p>
    </div>
  );
}
