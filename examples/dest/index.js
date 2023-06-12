
import { Web5 } from 'https://cdn.jsdelivr.net/npm/@tbd54566975/web5@0.7.6/dist/browser.mjs';

const attributes = ['src', 'href', 'data'];
const splitDRL = /^(.*?)\/(.*)$/;

function detectMutation(element){
  console.log(element);
  const attribute = attributes.find(attr => {
    return element?.[attr]?.startsWith('did:') ? attr : null;
  });
  if (attribute) handleMutation(attribute, element);
}

async function handleMutation(attribute, element){
  const [_, did, path] = element[attribute]?.split(splitDRL) || [];
  if (did && path) {
    const response = await Web5.did.resolve(did);
    const nodes = response?.didDocument?.service?.find(service => service.type === 'DecentralizedWebNode')?.serviceEndpoint.nodes;
    element[attribute] = `${nodes[0].replace(/\/$/, '')}/${did}/${path}`;
  }
}

document.addEventListener('DOMContentLoaded', e => {
  const elements = document.querySelectorAll('[' + attributes.join('], [') + ']');
  for (const element of elements) {
    detectMutation(element);
  }
});

(new MutationObserver(mutationsList => {
  for (const mutation of mutationsList) {
    detectMutation(mutation.target);
  }
})).observe(document, {
  subtree         : true,
  attributes      : true,
  attributeFilter : attributes,
});

/* TEST PAGE CODE */

const { web5, did } = await Web5.connect({
  techPreview: {
    dwnEndpoints: ['http://localhost:3000'],
  }
});

console.log(did);

if (localStorage.lastImageId) {
  image_element.setAttribute('src', `http://localhost:3000/${did}/records/${localStorage.lastImageId}`);
}

file_input.addEventListener('change', async e => {
  console.log(e);
  const file = e.target?.files?.[0];
  if (file) {
    const { record } = await web5.dwn.records.create({
      data    : file,
      message : {
        published  : true,
        dataFormat : file.type
      }
    });

    localStorage.lastImageId = record.id;

    console.log(record);
  }
});
