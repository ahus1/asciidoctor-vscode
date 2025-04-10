/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha'

import * as assert from 'assert'
import * as vscode from 'vscode'
import { AsciidocParser } from '../asciidocParser'
import { AsciidocContributionProvider, AsciidocContributions } from '../asciidocExtensions'
import { AsciidocPreview } from '../features/preview'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../security'

class EmptyAsciidocContributions implements AsciidocContributions {
  readonly previewScripts = []
  readonly previewStyles = []
  readonly previewResourceRoots = []
}

class AsciidocContributionProviderTest implements AsciidocContributionProvider {
  readonly extensionUri

  constructor (extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri
  }

  onContributionsChanged: vscode.Event<this>

  readonly contributions = new EmptyAsciidocContributions()

  dispose () {
    // noop
  }
}

suite('asciidoc.Asciidoctorconfig', () => {
  let extensionContext: vscode.ExtensionContext
  suiteSetup(async () => {
    // Trigger extension activation and grab the context as some tests depend on it
    await vscode.extensions.getExtension('vscode.vscode-api-tests')?.activate()
    extensionContext = (global as any).testExtensionContext
  })

  const configFileNames = ['.asciidoctorconfig', '.asciidoctorconfig.adoc']
  configFileNames.forEach((configFileName) => {
    test(`Pick up ${configFileName} from root workspace folder`, async () => {
      const webview = vscode.window.createWebviewPanel(
        AsciidocPreview.viewType,
        `Test pick up ${configFileName} from root workspace folder`,
        vscode.ViewColumn.One
      )
      let configFile: vscode.Uri
      try {
        const root = vscode.workspace.workspaceFolders[0].uri.fsPath
        configFile = vscode.Uri.file(`${root}/${configFileName}`)
        await vscode.workspace.fs.writeFile(configFile, Buffer.from(':application-name: Asciidoctor VS Code Extension'))
        const file = await vscode.workspace.openTextDocument(vscode.Uri.file(`${root}/attributes.adoc`))
        // eslint-disable-next-line max-len
        const asciidocParser = new AsciidocParser(new AsciidocContributionProviderTest(extensionContext.extensionUri), new AsciidoctorExtensionsSecurityPolicyArbiter(extensionContext))
        const { html } = await asciidocParser.convertUsingJavascript(file.getText(), file, extensionContext, webview)
        assert.strictEqual(html.includes('<h1>Asciidoctor VS Code Extension</h1>'), true, `{application-name} should be substituted by the value defined in ${configFileName}`)
      } finally {
        webview.dispose()
        if (configFile !== undefined) {
          await vscode.workspace.fs.delete(configFile)
        }
      }
    })
  })

  suite('Pick up .asciidoctorconfig and .asciidoctorconfig.adoc from root workspace folder', async () => {
    let html: string
    let webview: vscode.WebviewPanel
    const createdFiles: vscode.Uri[] = []

    suiteSetup(async () => {
      webview = vscode.window.createWebviewPanel(
        AsciidocPreview.viewType,
        'Test .asciidoctorconfig and .asciidoctorconfig.adoc from root workspace folder',
        vscode.ViewColumn.One
      )
      const root = vscode.workspace.workspaceFolders[0].uri.fsPath

      createdFiles.push(await createFileWithContentAtWorkspaceRoot(root, '.asciidoctorconfig',
        `:var-only-in-asciidoctorconfig: From .asciidoctorconfig
:var-in-both: var-in-both value from .asciidoctorconfig`))
      createdFiles.push(await createFileWithContentAtWorkspaceRoot(root, '.asciidoctorconfig.adoc',
        `:var-only-in-asciidoctorconfig-adoc: From .asciidoctorconfig.adoc
:var-in-both: var-in-both value from .asciidoctorconfig.adoc`))

      const adocForTest = await createFileWithContentAtWorkspaceRoot(root, 'test-pickup-both-asciidoctorconfig-at-workspace-root.adoc',
        `{var-in-both}

{var-only-in-asciidoctorconfig-adoc}

{var-only-in-asciidoctorconfig}`)
      createdFiles.push(adocForTest)
      const file = await vscode.workspace.openTextDocument(adocForTest)
      // eslint-disable-next-line max-len
      const asciidocParser = new AsciidocParser(new AsciidocContributionProviderTest(extensionContext.extensionUri), new AsciidoctorExtensionsSecurityPolicyArbiter(extensionContext))
      html = (await asciidocParser.convertUsingJavascript(file.getText(), file, extensionContext, webview)).html
    })

    suiteTeardown(async () => {
      webview.dispose()
      for (const createdFile of createdFiles) {
        await vscode.workspace.fs.delete(createdFile)
      }
    })

    test('Var from .asciidocforconfig is used', async () => {
      assert.strictEqual(html.includes('<p>From .asciidoctorconfig</p>'), true, '{var-only-in-asciidoctorconfig} should be substituted by the value defined in .asciidoctorconfig')
    })

    test('Var from .asciidocforconfig.adoc is used', async () => {
      assert.strictEqual(html.includes('<p>From .asciidoctorconfig.adoc</p>'), true, '{var-only-in-asciidoctorconfig.adoc} should be substituted by the value defined in .asciidoctorconfig.adoc')
    })

    test('Var from .asciidocforconfig.adoc has precedence on .asciidoctorconfig.adoc', async () => {
      assert.strictEqual(html.includes('<p>var-in-both value from .asciidoctorconfig.adoc</p>'), true, '{var-in-both} should be substituted by the value defined in .asciidoctorconfig.adoc')
    })

    async function createFileWithContentAtWorkspaceRoot (root: string, configFileName: string, fileContent: string) {
      const configFile = vscode.Uri.file(`${root}/${configFileName}`)
      await vscode.workspace.fs.writeFile(configFile, Buffer.from(fileContent))
      return configFile
    }
  })

  suite('Pick up .asciidocConfig file recursively', async () => {
    let html: string
    let webview: vscode.WebviewPanel
    const createdFiles: vscode.Uri[] = []

    suiteSetup(async () => {
      webview = vscode.window.createWebviewPanel(
        AsciidocPreview.viewType,
        'Test recursive access to .asciidoc files',
        vscode.ViewColumn.One
      )
      const root = vscode.workspace.workspaceFolders[0].uri.fsPath
      const configFileName = '.asciidoctorconfig'
      const rootConfigFile = vscode.Uri.file(`${root}/${configFileName}`)
      await vscode.workspace.fs.writeFile(rootConfigFile, Buffer.from(
        `:only-root: Only root. Should appear.
:root-and-level1: Value of root-and-level1 specified in root. Should not appear.
:root-and-level1-and-level2: Value of root-and-level1-and-level2 specified in root. Should not appear.`))
      createdFiles.push(rootConfigFile)

      const level1ConfigFile = vscode.Uri.file(`${root}/level-empty/level1/${configFileName}`)
      await vscode.workspace.fs.writeFile(level1ConfigFile, Buffer.from(
        `:only-level1: Only level 1. Should appear.
:root-and-level1: Value of root-and-level1 specified in level1. Should appear.
:root-and-level1-and-level2: Value of root-and-level1-and-level2 specified in level1. Should not appear.`))
      createdFiles.push(level1ConfigFile)

      const level2ConfigFile = vscode.Uri.file(`${root}/level-empty/level1/level2/${configFileName}`)
      await vscode.workspace.fs.writeFile(level2ConfigFile, Buffer.from(
        `:only-level2: Only level 2. Should appear.
:root-and-level1-and-level2: Value of root-and-level1-and-level2 specified in level2. Should appear.`))
      createdFiles.push(level2ConfigFile)

      const adocFile = vscode.Uri.file(`${root}/level-empty/level1/level2/fileToTestRecursiveAsciidoctorConfigs.adoc`)
      await vscode.workspace.fs.writeFile(adocFile, Buffer.from(
        `{only-root}

{only-level1}

{only-level2}

{root-and-level1}

{root-and-level1-and-level2}
              `))
      createdFiles.push(adocFile)

      const file = await vscode.workspace.openTextDocument(adocFile)
      // eslint-disable-next-line max-len
      const asciidocParser = new AsciidocParser(new AsciidocContributionProviderTest(extensionContext.extensionUri), new AsciidoctorExtensionsSecurityPolicyArbiter(extensionContext))
      html = (await asciidocParser.convertUsingJavascript(file.getText(), file, extensionContext, webview)).html
    })

    suiteTeardown(async () => {
      webview.dispose()
      for (const createdFile of createdFiles) {
        await vscode.workspace.fs.delete(createdFile)
      }
    })

    test('Var from root level is substituted', async () => {
      assert.strictEqual(
        html.includes('<p>Only root. Should appear.</p>'), true,
        '{only-root} should be substituted by the value defined at root level')
    })

    test('Var from level1 is substituted', async () => {
      assert.strictEqual(
        html.includes('<p>Only level 1. Should appear.</p>'), true,
        '{only-level1} should be substituted by the value defined at level 1')
    })

    test('Var from level2 is substituted', async () => {
      assert.strictEqual(
        html.includes('<p>Only level 2. Should appear.</p>'), true,
        '{only-level2} should be substituted by the value defined at level 2')
    })

    test('Deepest level should be use to substitue var', async () => {
      assert.strictEqual(
        html.includes('<p>Value of root-and-level1-and-level2 specified in level2. Should appear.</p>'), true,
        '{root-and-level1-and-level2} should be substituted by the value defined at level 2')
    })

    test('Intermediate but deepest level defined should be use to substitue var', async () => {
      assert.strictEqual(
        html.includes('<p>Value of root-and-level1 specified in level1. Should appear.</p>'), true,
        '{root-and-level1} should be substituted by the value defined at level 1')
    })
  })
})
