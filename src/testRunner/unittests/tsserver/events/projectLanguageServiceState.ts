import * as ts from "../../../_namespaces/ts";
import { createServerHost, File, libFile } from "../../virtualFileSystemWithWatch";
import { createSessionWithEventTracking, checkNumberOfProjects, configuredProjectAt, createProjectService, createLoggerWithInMemoryLogs, baselineTsserverLogs } from "../helpers";

describe("unittests:: tsserver:: events:: ProjectLanguageServiceStateEvent", () => {
    it("language service disabled events are triggered", () => {
        const f1 = {
            path: "/a/app.js",
            content: "let x = 1;"
        };
        const f2 = {
            path: "/a/largefile.js",
            content: "",
        };
        const config = {
            path: "/a/jsconfig.json",
            content: "{}"
        };
        const configWithExclude = {
            path: config.path,
            content: JSON.stringify({ exclude: ["largefile.js"] })
        };
        const host = createServerHost([f1, f2, config]);
        const originalGetFileSize = host.getFileSize;
        host.getFileSize = (filePath: string) =>
            filePath === f2.path ? ts.server.maxProgramSizeForNonTsFiles + 1 : originalGetFileSize.call(host, filePath);

        const { session, events } = createSessionWithEventTracking<ts.server.ProjectLanguageServiceStateEvent>(host, ts.server.ProjectLanguageServiceStateEvent);
        session.executeCommand({
            seq: 0,
            type: "request",
            command: "open",
            arguments: { file: f1.path }
        } as ts.server.protocol.OpenRequest);
        const projectService = session.getProjectService();
        checkNumberOfProjects(projectService, { configuredProjects: 1 });
        const project = configuredProjectAt(projectService, 0);
        assert.isFalse(project.languageServiceEnabled, "Language service enabled");
        assert.equal(events.length, 1, "should receive event");
        assert.equal(events[0].data.project, project, "project name");
        assert.equal(events[0].data.project.getProjectName(), config.path, "config path");
        assert.isFalse(events[0].data.languageServiceEnabled, "Language service state");

        host.writeFile(configWithExclude.path, configWithExclude.content);
        host.checkTimeoutQueueLengthAndRun(2);
        checkNumberOfProjects(projectService, { configuredProjects: 1 });
        assert.isTrue(project.languageServiceEnabled, "Language service enabled");
        assert.equal(events.length, 2, "should receive event");
        assert.equal(events[1].data.project, project, "project");
        assert.equal(events[1].data.project.getProjectName(), config.path, "config path");
        assert.isTrue(events[1].data.languageServiceEnabled, "Language service state");
    });

    it("Large file size is determined correctly", () => {
        const f1: File = {
            path: "/a/app.js",
            content: "let x = 1;"
        };
        const f2: File = {
            path: "/a/largefile.js",
            content: "",
            fileSize: ts.server.maxProgramSizeForNonTsFiles + 1
        };
        const f3: File = {
            path: "/a/extremlylarge.d.ts",
            content: "",
            fileSize: ts.server.maxProgramSizeForNonTsFiles + 100
        };
        const config = {
            path: "/a/jsconfig.json",
            content: "{}"
        };
        const host = createServerHost([f1, f2, f3, libFile, config]);
        const service = createProjectService(host, { logger: createLoggerWithInMemoryLogs(host) });
        service.openClientFile(f1.path);
        const project = service.configuredProjects.get(config.path)!;
        service.logger.info(`languageServiceEnabled: ${project.languageServiceEnabled}`);
        service.logger.info(`lastFileExceededProgramSize: ${project.lastFileExceededProgramSize}`);
        baselineTsserverLogs("projectLanguageServiceStateEvent", "large file size is determined correctly", service);
    });
});
