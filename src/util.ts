export async function getRevision() {
    return fetch(`/assets/dash.rev`).then(x => x.text());
}