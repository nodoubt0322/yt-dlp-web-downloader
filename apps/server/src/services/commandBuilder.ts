export function buildAnalyzeArgs(url: string): string[] {
  return ["--dump-json", "--no-playlist", "--no-warnings", "--", url];
}

export interface BuildDownloadArgsOptions {
  url: string;
  homePath: string;
  tempPath: string;
  outputTemplate: string;
}

export function buildDownloadArgs(options: BuildDownloadArgsOptions): string[] {
  return [
    "--no-playlist",
    "--newline",
    "--progress-template",
    "download:%(progress)j",
    "-S",
    "res:1080",
    "--merge-output-format",
    "mp4",
    "--paths",
    `home:${options.homePath}`,
    "--paths",
    `temp:${options.tempPath}`,
    "-o",
    options.outputTemplate,
    "--",
    options.url
  ];
}
