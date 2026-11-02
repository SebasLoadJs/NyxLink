# Prerelease npm 0.1.0-dev.1

El propietario solicitó publicar nyxlink y confirmó que completó npm login. Se verificó la cuenta melodiabl y que el registro público todavía no devolvía un paquete nyxlink. La publicación manual de esta versión está autorizada; no habilita publicación automática ni certifica audio real.

Estado: preparación validada; publicación intentada y rechazada por npm con E403. El registro exige 2FA o un token granular con bypass de 2FA; la cuenta autenticada todavía tiene 2FA desactivado. La comprobación posterior devolvió 404 para nyxlink: no se publicó ningún paquete. Se solicitó al propietario activar 2FA antes de reintentar.

La versión se distribuye con tag dev y access public, fijados por publishConfig para https://registry.npmjs.org/. El paquete retira private=true; los workflows siguen validando sin publicar. La comprobación del tarball exige estos valores y preserva identidad, dependencias, licencia, exports CJS/ESM, tipos y ejemplos JS/TS. Es una actualización del control de distribución autorizada por el propietario, no la eliminación de las verificaciones del paquete.

```sh
npm install nyxlink@dev
# Pin exacto:
npm install nyxlink@0.1.0-dev.1
```

La preparación pasó 164 pruebas sin omitidas, typecheck/tipos, seis comprobaciones del paquete instalado, allowlist y auditoría de producción. El código funcional es el consolidado en dev por PR #6; la evidencia de protocolo y una hora se conserva en docs/validation.md. Audio Discord/DAVE, mixer durante reproducción y proveedores reales siguen pendientes. Qodana requiere su token y no se declara superado.

El tag de código v0.1.0-dev.1 identifica la fuente de esta prerelease. El tarball se publica explícitamente con npm publish <archivo.tgz> --registry=https://registry.npmjs.org/ --access=public --tag=dev --ignore-scripts, después de validar el mismo archivo. El registro y una instalación limpia desde npm se verificarán tras la subida.

Referencias: [private/publishConfig](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#publishconfig), [npm publish y dist-tags](https://docs.npmjs.com/cli/v11/commands/npm-publish/).

La [evidencia de publicación](npm-publication-evidence.json) conserva el resultado rechazado sin credenciales. La fuente de la prerelease preparada es 1abd398 y el tag v0.1.0-dev.1; las actualizaciones posteriores de esta evidencia no modifican el tarball validado.
