import * as os from "os";
import {
  languages,
  workspace,
  ExtensionContext,
  window,
  commands,
  CompletionItem,
  SnippetString,
} from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";
import { promisify } from "util";
import { execFile } from "child_process";

let client: LanguageClient | null = null;

const outputChannel = window.createOutputChannel("Wasp Language Server");

export async function activate(context: ExtensionContext): Promise<void> {
  console.log('..Extension "vscode-wasp" is now active..');

  // Configuration name and properties are set in package.json
  const config = workspace.getConfiguration("wasp");

  const executablePath = resolveWaspExecutablePath(config.server.executable);

  // Check if the path points to a valid wasp executable
  const waspExecResult = await getWaspExecutableVersion(executablePath);

  if (typeof waspExecResult !== "string") {
    if (waspExecResult.type === "WaspVersionTimedout") {
      window.showErrorMessage("The wasp server process has timed out.");
    } else if (waspExecResult.type === "WaspExeMissing") {
      if (executablePath === "wasp") {
        window.showErrorMessage("No `wasp` executable is available in the VSCode PATH.");
      } else {
        window.showErrorMessage(
          `The user defined executable path couldn't be run: ${executablePath} . More details: ${waspExecResult.error}`,
        );
      }
    }
    return;
  }

  const waspVersion = waspExecResult;
  outputChannel.appendLine("Confirmed that wasp executable is accessible, version " + waspVersion);

  const minSupportedWaspVersion = "0.6.0";
  if (compareSimpleSemvers(waspVersion, minSupportedWaspVersion) === -1) {
    window.showErrorMessage(
      `Version of your installed wasp executable is ${waspVersion}, but this VSCode extension supports only` +
        ` wasp >= ${minSupportedWaspVersion}. Either update wasp or downgrade this extension.`,
    );
    return;
  }

  // Register snippets for .wasp files.
  const snippets = getSnippets(waspVersion);
  const provider = languages.registerCompletionItemProvider("wasp", {
    provideCompletionItems(document, position) {
      // Return the appropriate snippets as completion items.
      return snippets.map((snippet) => {
        const completionItem = new CompletionItem(snippet.prefix);
        completionItem.insertText = new SnippetString(snippet.body.join("\n"));
        completionItem.detail = snippet.description;
        return completionItem;
      });
    },
  });
  context.subscriptions.push(provider);

  // TODO: send these settings to wasp language server so it can update its logging output if
  // these are changed while the language server is running
  const useOutputPanel = config.server.useOutputPanelForLogging;
  const logFile = useOutputPanel ? "[OUTPUT]" : config.server.logFile;
  const logFileOpt = logFile.trim() === "" ? [] : ["--log=" + logFile];

  // Configure vscode-languageclient
  const runArgs = ["waspls", ...logFileOpt];
  const debugArgs = ["waspls", ...logFileOpt];

  const serverOptions: ServerOptions = {
    run: {
      command: executablePath,
      transport: TransportKind.stdio,
      args: runArgs,
    },
    debug: {
      command: executablePath,
      transport: TransportKind.stdio,
      args: debugArgs,
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "wasp" }],
    initializationOptions: {
      "vscode-wasp": workspace.getConfiguration("vscode-wasp"),
    },
    outputChannel: outputChannel,
  };

  client = new LanguageClient("vscode-wasp", "VSCode Wasp", serverOptions, clientOptions);

  outputChannel.appendLine("Starting Wasp LSP Server..");
  client
    .start()
    .then(() => {
      outputChannel.appendLine("..Wasp LSP Server has been successfully started!");
    })
    .catch(() => {
      let failedToConnectErrorMsg =
        "Failed to connect to Wasp language server! Advanced Wasp IDE features won't work.";
      const earliestWaspVersionWithLspCapabilities = "0.6.0.0";
      if (compareSimpleSemvers(waspVersion, earliestWaspVersionWithLspCapabilities) === -1) {
        failedToConnectErrorMsg += ` CAUSE: Your Wasp version is ${waspVersion}, but it should be at least ${earliestWaspVersionWithLspCapabilities}.`;
      }
      outputChannel.appendLine(".." + failedToConnectErrorMsg);
      // NOTE: I use timeout here so this error message doesn't get printed at the same time as the error messages produced by the
      // LanguageClient itself (and it produces a bunch of them), because if they all get very close in time vscode hides them immediately
      // due to there being too many of them at the same moment. By using timeout, our message gets separated and stays for some time as a popup,
      // instead of skipping directly into notification tray.
      setTimeout(() => window.showErrorMessage(failedToConnectErrorMsg), 1000);
    });

  // Register command to restart wasp language server.
  context.subscriptions.push(
    commands.registerCommand("vscode-wasp.restartLanguageServer", async () => {
      if (!client) return;
      try {
        outputChannel.appendLine(`Restarting Wasp LSP Server..`);
        await client.restart();
        outputChannel.appendLine(`..Wasp LSP Server has been restarted!`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : err;
        outputChannel.appendLine(`Couldn't restart Wasp LSP Server: ${errMsg}`);
      }
    }),
  );
}

export function deactivate(): void {
  if (client) {
    client.stop();
  }
}

// For a given user defined wasp executable path with possibly vs-code specific path variables,
// returns interpolated executable path that can then be normally used.
// If no path is given, it returns default path to wasp executable.
function resolveWaspExecutablePath(userDefinedWaspExecutablePath: string): string {
  if (!userDefinedWaspExecutablePath) return "wasp";
  console.log(`Trying to find the server executable in ${userDefinedWaspExecutablePath}`);
  const resolvedPath = interpolateVSCodeSpecificExecutablePath(userDefinedWaspExecutablePath);
  console.log(`Location after path variables subsitution: ${resolvedPath}`);
  return resolvedPath;
}

// Given a path to executable that contains common vscode-specific path variables,
// replaces those variables with proper values.
function interpolateVSCodeSpecificExecutablePath(executablePath: string): string {
  // Interpolate in values for common vscode path variables

  // Path variable for home directory
  executablePath = executablePath
    .replace("${HOME}", os.homedir)
    .replace("${home}", os.homedir)
    .replace(/^~/, os.homedir);

  // Path variable for workspace folder
  const folders = workspace.workspaceFolders;
  if (folders) {
    const folder = folders[0];
    if (folder) {
      executablePath = executablePath
        .replace("${workspaceFolder}", folder.uri.path)
        .replace("${workspaceRoot}", folder.uri.path);
    }
  }

  return executablePath;
}

// Runs the wasp executable in `version` mode and checks that it:
// - Exits successfuly
// - Exits within 1 second
//
// If it fails either of these checks, a status is returned to show that the
// executable path is not valid.
async function getWaspExecutableVersion(
  executablePath: string,
): Promise<WaspVersionError | string> {
  const execFileP = promisify(execFile);
  const execPromise = execFileP(executablePath, ["version"], {
    timeout: 2000,
    windowsHide: true,
  })
    .then(({ stdout }) => stdout.split("\n")[0]) // We assume `wasp version` returns version as a single string in the first line, with nothing else.
    .catch((e) => ({ type: "WaspExeMissing", error: e }) as WaspExeMissing);

  const timeoutPromise = new Promise<WaspVersionTimedout>((resolve) =>
    setTimeout(() => resolve({ type: "WaspVersionTimedout" } as WaspVersionTimedout), 1000),
  );

  return Promise.race([execPromise, timeoutPromise]);
}

type WaspVersionError = WaspExeMissing | WaspVersionTimedout;
interface WaspExeMissing {
  type: "WaspExeMissing";
  error: any;
}
interface WaspVersionTimedout {
  type: "WaspVersionTimedout";
}

// Given two semantic version strings, returns -1 if first version is smaller than the second,
// 0 if they are the same, or 1 if first version is bigger than the second.
function compareSimpleSemvers(v1: string, v2: string): -1 | 0 | 1 {
  const LT = -1,
    GT = 1,
    EQ = 0;
  const v1Parsed = parseSemver(v1);
  const v2Parsed = parseSemver(v2);
  for (let i = 0; i < Math.min(v1Parsed.length, v2Parsed.length); i++) {
    if (v1Parsed[i] < v2Parsed[i]) return LT;
    else if (v1Parsed[i] > v2Parsed[i]) return GT;
  }
  if (v1Parsed.length < v2Parsed.length) return LT;
  else if (v1Parsed.length > v2Parsed.length) return GT;
  else return EQ;
}

// Parses simple semver string into list of numbers.
function parseSemver(v: string): number[] {
  return v.split(".").map((n) => parseInt(n));
}

type Snippet = {
  prefix: string;
  description: string;
  body: string[];
};

function getSnippets(waspVersion: string): Snippet[] {
  const [major, minor] = parseSemver(waspVersion);

  const [extImportClientPrefix, extImportServerPrefix] =
    major == 0 && minor <= 11 ? ["@client", "@server"] : ["@src", "@src"];

  const snippetPageAndRouteBody = [
    'route ${1:Name}Route { path: "/${2:path}", to: ${1:Name} }',
    "page ${1:Name} {",
    `\tcomponent: import \${1:name} from "${extImportClientPrefix}/\${3:sourceFile}"`,
    "}",
  ];

  const snippets = [
    {
      prefix: "page",
      description: "[snippet] Create a new page and route",
      body: snippetPageAndRouteBody,
    },

    {
      prefix: "route",
      description: "[snippet] Create a new page and route",
      body: snippetPageAndRouteBody,
    },

    {
      prefix: "route",
      description: "[snippet] Create a new route",
      body: ['route ${1:Name}Route { path: "/${2:path}", to: ${3:PageName} }'],
    },

    {
      prefix: "query",
      description: "[snippet] Create a new query",
      body: [
        "query ${1:name} {",
        `\tfn: import \${2:function} from "${extImportServerPrefix}/\${3:sourceFile}",`,
        "\tentities: [$4]",
        "}",
      ],
    },

    {
      prefix: "action",
      description: "[snippet] Create a new action",
      body: [
        "action ${1:name} {",
        `\tfn: import \${2:function} from "${extImportServerPrefix}/\${3:sourceFile}",`,
        "\tentities: [$4]",
        "}",
      ],
    },

    {
      prefix: "job",
      description: "[snippet] Create a new job",
      body: [
        "job ${1:Name} {",
        "\texecutor: PgBoss,",
        "\tperform: {",
        `\t\tfn: import \${2:FnName} from "${extImportServerPrefix}/\${3:sourceFile}"`,
        "\t},",
        "\tentities: [$4],",
        "}",
      ],
    },

    {
      prefix: "api",
      description: "[snippet] Create a new api route",
      body: [
        "api ${1:name} {",
        '\thttpRoute: (${2:GET}, "${3:path}"),',
        `\tfn: import \${4:function} from "${extImportServerPrefix}/\${5:sourceFile}",`,
        "\tentities: [$6]",
        "}",
      ],
    },

    {
      prefix: "apiNamespace",
      description: "[snippet] Create a new api namespace",
      body: [
        "apiNamespace ${1:name} {",
        `\tmiddlewareConfigFn: import \${2:middlewareFn} from "${extImportServerPrefix}/\${3:sourceFile}",`,
        '\tpath: "${4:path}"',
        "}",
      ],
    },

    {
      prefix: "crud",
      description: "[snippet] Create a new crud",
      body: [
        "crud ${1:Name} {",
        "\tentity: ${2:EntityName},",
        "\toperations: {",
        "\t\tget: {},",
        "\t\tgetAll: {},",
        "\t\tcreate: {},",
        "\t\tupdate: {},",
        "\t\tdelete: {},",
        "\t},",
        "}",
      ],
    },
  ];

  // We removed `entity` declaration in 0.14.0
  if (major == 0 && minor <= 13) {
    snippets.push({
      prefix: "entity",
      description: "[snippet] Create a new entity",
      body: ["entity ${1:Name} {=psl", "\t${2:schema}", "psl=}"],
    });
  }

  return snippets;
}
