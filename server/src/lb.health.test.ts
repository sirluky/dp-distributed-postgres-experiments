import {
    afterAll,
    beforeAll,
    describe,
    expect,
    setDefaultTimeout,
    test,
} from "bun:test";
import { resolve } from "node:path";

const runLbIntegration = process.env.RUN_LB_INTEGRATION === "1";
const describeLb = runLbIntegration ? describe : describe.skip;
setDefaultTimeout(45_000);

const repoRoot = resolve(import.meta.dir, "..", "..");

function run(command: string) {
    const proc = Bun.spawnSync(["bash", "-lc", command], {
        cwd: repoRoot,
        stdout: "pipe",
        stderr: "pipe",
    });

    if (proc.exitCode !== 0) {
        const stdout = Buffer.from(proc.stdout).toString("utf8");
        const stderr = Buffer.from(proc.stderr).toString("utf8");
        throw new Error(
            `Command failed (${proc.exitCode}): ${command}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
        );
    }

    return Buffer.from(proc.stdout).toString("utf8").trim();
}

async function sleep(ms: number) {
    await Bun.sleep(ms);
}

type LbNode = {
    count: number;
    healthy: boolean;
    host: string;
    port: number;
    error?: string;
};

type LbHealth = {
    nodes: Record<string, LbNode>;
    total_connections: number;
    healthy_nodes: number;
    total_nodes: number;
};

async function getLbHealth(): Promise<LbHealth> {
    const res = await fetch("http://localhost:8080/health/db");
    if (!res.ok) {
        throw new Error(`LB health endpoint failed with status ${res.status}`);
    }
    return (await res.json()) as LbHealth;
}

async function waitForNode(
    nodeName: string,
    predicate: (node: LbNode) => boolean,
    timeoutMs = 20_000,
): Promise<LbNode> {
    const started = Date.now();
    let lastNode: LbNode | undefined;

    while (Date.now() - started < timeoutMs) {
        const health = await getLbHealth();
        lastNode = health.nodes[nodeName];
        if (lastNode && predicate(lastNode)) {
            return lastNode;
        }
        await sleep(1200);
    }

    throw new Error(`Timed out waiting for node '${nodeName}'. Last: ${JSON.stringify(lastNode)}`);
}

describeLb("LB health sentinels", () => {
    beforeAll(async () => {
        // Ensure relevant services are running before manipulating them in tests.
        run("docker compose up -d app_edge1 app_edge2 app_edge3 db_edge1 db_edge2 db_edge3 lb");
        await sleep(3500);
    });

    afterAll(async () => {
        // Always recover services so other tests/flows are not impacted.
        run("docker compose start app_edge1 app_edge2 app_edge3 db_edge1 db_edge2 db_edge3 lb");
        await sleep(3000);
    });

    test("returns 9999 when app can reach endpoint but DB is down", async () => {
        run("docker compose stop db_edge1");

        const node = await waitForNode(
            "edge1",
            (n) => n.count === 9999 && n.healthy === false,
        );

        expect(node.count).toBe(9999);
        expect(node.healthy).toBe(false);

        run("docker compose start db_edge1");
        await waitForNode("edge1", (n) => n.healthy === true && n.count < 9999);
    });

    test("returns 10000 when LB cannot reach app endpoint", async () => {
        run("docker compose stop app_edge2");

        const node = await waitForNode(
            "edge2",
            (n) => n.count === 10000 && n.healthy === false,
        );

        expect(node.count).toBe(10000);
        expect(node.healthy).toBe(false);

        run("docker compose start app_edge2");
        await waitForNode("edge2", (n) => n.healthy === true && n.count < 9999);
    });
});
