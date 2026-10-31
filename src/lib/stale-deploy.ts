/**
 * A page left open across an update still holds the old version's code: its buttons call server actions or load
 * files that no longer exist. Those errors mean "reload", not "something broke". The error screens read the error
 * only for this test; they never show it.
 */
export const STALE_DEPLOY = /server action|older or newer deployment|chunkloaderror|loading chunk|dynamically imported module|importing a module script failed|unexpected response was received from the server/i;

export const isStaleDeploy = (error: Pick<Error, "name" | "message">) => STALE_DEPLOY.test(`${error.name} ${error.message}`);
