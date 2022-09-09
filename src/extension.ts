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

  // Configuration name and properties are set in package.json
  const config = workspace.getConfiguration('wasp');

  const executablePath = resolveWaspExecutablePath(config.server.executable);

  // Check if the path points to a valid wasp executable
  const waspExecResult = await getWaspExecutableVersion(executablePath);

  let waspVersion:string
  if (typeof(waspExecResult) === 'string') {
    waspVersion = waspExecResult;
    outputChannel.appendLine("Confirmed that wasp executable is accessible, version " + waspVersion);
  } else {
    if (waspExecResult === ExecutableErrorStatus.Timedout) {
      window.showInformationMessage(`The wasp server process has timed out.`);
    } else if (waspExecResult === ExecutableErrorStatus.Missing) {
      if (executablePath === 'wasp') {
        window.showErrorMessage('No `wasp` executable is available in the VSCode PATH.');
      } else {
        window.showInformationMessage(`The user defined executable path couldn't be run: [${executablePath}].`);
      }
    }
    return;
  }

  // TODO: send these settings to wasp language server so it can update its logging output if
  // these are changed while the language server is running
  const useOutputPanel = config.server.useOutputPanelForLogging;
  const logFile = useOutputPanel ? "[OUTPUT]" : config.server.logFile;
  const logFileOpt = logFile.trim() === '' ? [] : ['--log=' + logFile];

  // Configure vscode-languageclient
  let runArgs = ['waspls', ...logFileOpt];
  let debugArgs = ['waspls', ...logFileOpt];

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
    initializationOptions: { 'vscode-wasp': workspace.getConfiguration('vscode-wasp') },
    outputChannel: outputChannel
  };

  client = new LanguageClient(
    'vscode-wasp',
    'VSCode Wasp',
    serverOptions,
    clientOptions,
  );

  outputChannel.appendLine('Starting Wasp LSP Server..');
  client.start()
    .then(() => {
      outputChannel.appendLine('..Wasp LSP Server has been successfully started!');
    })
    .catch((err) => {
      let failedToConnectErrorMsg = "Failed to connect to Wasp language server! Advanced Wasp IDE features won't work."
      const requiredWaspVersion = "0.6.0.0"  // Because earlier wasp versions don't have language server capabilities.
      if (compareSimpleSemvers(waspVersion, "6.0.0") === -1) {
        failedToConnectErrorMsg += ` CAUSE: Your Wasp version is ${waspVersion}, but it should be at least ${requiredWaspVersion}.`
      }
      outputChannel.appendLine(".." + failedToConnectErrorMsg);
      // NOTE: I use timeout here so this error message doesn't get printed at the same time as the error messages produced by the
      // LanguageClient itself (and it produces a bunch of them), because if they all get very close in time vscode hides them immediately
      // due to there being too many of them at the same moment. By using timeout, our message gets separated and stays for some time as a popup,
      // instead of skipping directly into notification tray.
      setTimeout(() => window.showErrorMessage(failedToConnectErrorMsg), 1000)
    });

  // Register command to restart wasp language server.
  context.subscriptions.push(commands.registerCommand('vscode-wasp.restartLanguageServer', async () => {
    if (client) {
      try {
        outputChannel.appendLine(`Restarting Wasp LSP Server..`);
        await client.restart();
        outputChannel.appendLine(`..Wasp LSP Server has been restarted!`);
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

// For a given user defined wasp executable path with possibly vs-code specific path variables,
// returns interpolated executable path that can then be normally used.
// If no path is given, it returns default path to wasp executable.
function resolveWaspExecutablePath(userDefinedWaspExecutablePath: string): string {
  if (!userDefinedWaspExecutablePath) return 'wasp';
  console.log(`Trying to find the server executable in ${userDefinedWaspExecutablePath}`);
  let resolvedPath = interpolateVSCodeSpecificExecutablePath(userDefinedWaspExecutablePath)
  console.log(`Location after path variables subsitution: ${resolvedPath}`);
  return resolvedPath;
}

// Given a path to executable that contains common vscode-specific path variables,
// replaces those variables with proper values.
function interpolateVSCodeSpecificExecutablePath(executablePath: string): string {
    // Interpolate in values for common vscode path variables

    // Path variable for home directory
    executablePath = executablePath
        .replace('${HOME}', os.homedir)
        .replace('${home}', os.homedir)
        .replace(/^~/, os.homedir);

    // Path variable for workspace folder
    let folders = workspace.workspaceFolders;
    if (folders) {
        let folder = folders[0];
        if (folder) {
            executablePath = executablePath
                .replace('${workspaceFolder}', folder.uri.path)
                .replace('${workspaceRoot}', folder.uri.path);
        }
    }

    return executablePath
}

// Runs the wasp executable in `version` mode and checks that it:
// - Exits successfuly
// - Exits within 1 second
//
// If it fails either of these checks, a status is returned to show that the
// executable path is not valid.
async function getWaspExecutableVersion(executablePath: string): Promise<ExecutableErrorStatus | string> {
  const execFileP = promisify(execFile);
  const execPromise = execFileP(executablePath, ['version'], { timeout: 2000, windowsHide: true })
    .then(({stdout}) => stdout)
    .catch(_err => ExecutableErrorStatus.Missing);

  const timeoutPromise = new Promise<ExecutableErrorStatus>((resolve) => setTimeout(() => resolve(ExecutableErrorStatus.Timedout), 1000));

  return Promise.race([execPromise, timeoutPromise]);
}

enum ExecutableErrorStatus { Missing, Timedout }

// Given two semantic version strings, returns -1 if first version is smaller than the second,
// 0 if they are the same, or 1 if second version is bigger than the first.
function compareSimpleSemvers(v1: string, v2: string) {
  function parseSemver(v:string) { return v.split('.').map(n => parseInt(n)) };
  const v1Parsed = parseSemver(v1);
  const v2Parsed = parseSemver(v2);
  for (let i = 0; i < Math.min(v1Parsed.length, v2Parsed.length); i++) {
    if (v1Parsed[i] > v2Parsed[i]) return 1;
    else if (v1Parsed[i] < v2Parsed[i]) return -1;
  }
  if (v1Parsed.length < v2Parsed.length) return -1;
  else if (v1Parsed.length > v2Parsed.length) return 1;
  else return 0;
}
