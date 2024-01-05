# Chrome extension for PassHub


The extension is a helper tool for the [PassHub.net](https://passhub.net) web password manager. 

PassHub employs [WWPass](https://www.wwpass.com/) technology for strong multi-factor authentication (MFA) and client-side encryption. PassHub features credentials, notes, bank cards, and file storage combined with fine-grained sharing capabilities. The PassHub interface resembles the well-known KeePass user experience. In addition, PassHub is fully export/import compatible with KeePass, the password manager of choice for IT professionals. 

The **PassHub Chrome extension** is a non-intrusive tool to fill username/password fields in login forms as well as bank card data on payment pages.

By no means is the extension a silver bullet; rather, it is a semi-manual tool to select the appropriate account and fill usernames and passwords into login forms on web sites. 

For more information on the extension and its use, see the PassHub docs: https://passhub.net/doc/browser-extension.


The extension is a lightweight bridge between a target web page with login or payment forms and the PsssHub web page. 

The present version supports both permanent external connections inherited from manifest V2 and a new protocol based on the "awake" procedure, see `background.js` file.


## License

The extension is GPL-licensed and borrows some code related to form fill from the [**passf**](https://github.com/passff/passff) project.
