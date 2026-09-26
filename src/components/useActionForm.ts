"use client";

import { useActionState, useTransition } from "react";

/**
 * Like useActionState, but submits via onSubmit so React doesn't clear the form afterwards.
 * (React 19 resets uncontrolled fields after any `<form action>` submission, including ones that
 * come back with a validation error, which would make people retype everything.)
 */
export function useActionForm<S>(action: (state: Awaited<S>, form: FormData) => S | Promise<S>, initial: Awaited<S>) {
  const [state, formAction, pending] = useActionState<S, FormData>(action, initial);
  const [transitioning, start] = useTransition();
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(() => formAction(fd));
  };
  return [state, onSubmit, pending || transitioning] as const;
}
