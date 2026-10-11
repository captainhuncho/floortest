"use client";

import { useActionState } from "react";
import { joinTeam, type TeamState } from "@/app/dashboard/actions/account-team";

export function JoinButton({ token, name }: { token: string; name: string }) {
  const [state, act, pending] = useActionState<TeamState>(() => joinTeam(token), null);
  return (
    <form action={act} className="mt-6 flex flex-col gap-3">
      {state?.error && (
        <p role="alert" className="text-[13px] text-danger">
          {state.error}
        </p>
      )}
      <button disabled={pending} className="btn-lime">
        {pending ? "Joining…" : `Join ${name}`}
      </button>
    </form>
  );
}
