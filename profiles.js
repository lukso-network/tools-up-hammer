profile = {
    json: {
      LSP3Profile: {
        name: "My Universal Profile",
        description: "My cool Universal Profile",
        profileImage: [
          {
            width: 500,
            height: 500,
            hashFunction: "keccak256(bytes)",
            // bytes32 hex string of the image hash
            hash: "0xfdafad027ecfe57eb4ad047b938805d1dec209d6e9f960fc320d7b9b11cbed14",
            url: "ipfs://QmPLqMFHxiUgYAom3Zg4SiwoxDaFcZpHXpCmiDzxrtjSGp",
          },
        ],
        backgroundImage: [
          {
            width: 500,
            height: 500,
            hashFunction: "keccak256(bytes)",
            // bytes32 hex string of the image hash
            hash: "0xfdafad027ecfe57eb4ad047b938805d1dec209d6e9f960fc320d7b9b11cbed14",
            url: "ipfs://QmPLqMFHxiUgYAom3Zg4SiwoxDaFcZpHXpCmiDzxrtjSGp",
          },
        ],
        tags: ['Fashion', 'Design'],
        links: [{ title: "My Website", url: "www.my-website.com" }],
      },
    },
    url: "",
};
module.exports = profile;