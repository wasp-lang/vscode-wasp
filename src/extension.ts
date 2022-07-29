import * as os from 'os';
import { workspace, ExtensionContext, window, commands } from 'vscode';

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';
import { promisify } from 'util';
import { execFile } from 'child_process';

let client: LanguageClient;

const outputChannel = window.createOutputChannel('Wasp Language Server');

export async function activate(context: ExtensionContext) {
  console.log('..Extension "vscode-wasp" is now active..');

  const config = workspace.getConfiguration('wasp');

  const userDefinedExecutablePath = config.server.executable;
  let executablePath = userDefinedExecutablePath === '' ? 'waspls' : userDefinedExecutablePath;

  console.log(`Trying to find the server executable in ${executablePath}`);
  executablePath = executablePath
    .replace('${HOME}', os.homedir)
    .replace('${home}', os.homedir)
    .replace(/^~/, os.homedir);
  if (executablePath === '') {
    window.showErrorMessage(`wasp executable path ${executablePath} is empty, check your configuration`);
    return;
  }

  let folders = workspace.workspaceFolders
  if (folders) {
    let folder = folders[0]
    if (folder) {
      executablePath = executablePath.replace('${workspaceFolder}', folder.uri.path).replace('${workspaceRoot}', folder.uri.path);
    }
  }

  console.log(`Location after path variables subsitution: ${executablePath}`);

  const executableStatus = await checkExecutable(executablePath);

  if (executableStatus !== 'available') {
    if (executableStatus === 'timedout') {
      window.showInformationMessage(`The wasp server process has timed out.`);
    } else {
      if (userDefinedExecutablePath === '') {
        window.showErrorMessage('No `waspls` executable is available in the VSCode PATH.');
        return;
      } else {
        window.showInformationMessage(`The user defined executable path couldn't be run: [${executablePath}].`);
      }
    }
  }

  // TODO: send these settings to waspls so it can update its logging output if
  // these are changed while the language server is running
  const useOutputPanel = config.server.useOutputPanelForLogging;
  const logFile = useOutputPanel ? "[OUTPUT]" : config.server.logFile;
  const logFileOpt = logFile.trim() === '' ? [] : ['--log=' + logFile];

  let runArgs = [...logFileOpt];
  let debugArgs = [...logFileOpt];

  let serverOptions: ServerOptions = {
    run: {
      command: executablePath,
      transport: TransportKind.stdio,
      args: runArgs,
    },
    debug: {
      command: executablePath,
      transport: TransportKind.stdio,
      args: debugArgs,
    }
  };

  let clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'wasp' }],
    initializationOptions: {
      'vscode-wasp': workspace.getConfiguration('vscode-wasp'),
    },
    outputChannel: outputChannel
  };

  client = new LanguageClient(
    'vscode-wasp',
    'VSCode Wasp',
    serverOptions,
    clientOptions,
  );

  client.start();
  outputChannel.appendLine('..Wasp LSP Server has been started..');

  context.subscriptions.push(commands.registerCommand('vscode-wasp.restartLanguageServer', async () => {
    if (client) {
      try {
        console.log(`..Restarting Wasp LSP Server..`);
        await client.restart();
        console.log(`..Wasp LSP Server has been restarted..`);
      } catch (err) {
        outputChannel.appendLine(`Couldn't restart Wasp LSP Server: ${err.message}`);
      }
    }
  }));
}

export function deactivate() {
  if (client) {
    client.stop();
  }
}

async function checkExecutable(executablePath: string): Promise<Status> {
  const execPromise = promisify(execFile)
    (executablePath, ['version'], { timeout: 2000, windowsHide: true })
    .then(() => Status.Available).catch(_err => Status.Missing);

  const timeoutPromise = new Promise<Status>((resolve, _reject) => {
    let timer = setTimeout(() => {
      clearTimeout(timer);
      resolve(Status.Timedout);
    }, 1000);
  });

  return Promise.race([execPromise, timeoutPromise]);
}

enum Status {
  Available = 'available',
  Missing = 'missing',
  Timedout = 'timedout',
}
