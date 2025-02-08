type LogStep = {
  step: number;
  prefix?: string;
};

class Logger {
  private static instance: Logger;
  private currentStep: number = 1;
  private prefix: string = "";

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  startSection(sectionName: string) {
    console.log(`\n--- [ START ${sectionName} ] ---`);
    this.currentStep = 1;
    return this;
  }

  endSection(sectionName: string) {
    console.log(`--- [ END ${sectionName} ] ---\n`);
    this.currentStep = 1;
    return this;
  }

  setPrefix(prefix: string) {
    this.prefix = prefix;
    return this;
  }

  log(message: string, options: Partial<LogStep> = {}) {
    const stepNum = options.step || this.currentStep;
    const prefix = options.prefix || this.prefix;
    console.log(`[${stepNum}]${prefix ? ` ${prefix}:` : ""} ${message}`);
    this.currentStep++;
    return this;
  }

  error(message: string, error?: any) {
    console.error(
      `[ERROR]${this.prefix ? ` ${this.prefix}:` : ""} ${message}`,
      error || ""
    );
    return this;
  }

  reset() {
    this.currentStep = 1;
    this.prefix = "";
    return this;
  }
}

export const logger = Logger.getInstance();
