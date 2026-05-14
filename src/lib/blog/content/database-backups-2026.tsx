import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "database-backups-2026",
  title: "Database Backups That Actually Work in 2026",
  description:
    "Point-in-time recovery vs logical dumps vs storage snapshots. What each one buys you, what they don't, and the restore drills that prove they work.",
  publishedAt: "2026-05-11",
  updatedAt: "2026-05-14",
  readingMinutes: 11,
  tags: ["postgres", "backups", "operations", "disaster-recovery"],
  related: ["postgres-mvcc-when-it-bites", "postgres-observability-stack-2026", "zero-downtime-migrations"],
  toc: [
    { id: "rto-rpo", label: "RTO and RPO, briefly" },
    { id: "pitr", label: "Point-in-time recovery (PITR)" },
    { id: "pg-dump", label: "Logical dumps (pg_dump)" },
    { id: "snapshots", label: "Storage snapshots" },
    { id: "managed-providers", label: "What managed providers actually give you" },
    { id: "the-drill", label: "The restore drill" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        Backups exist to be restored. The backup that&apos;s never been
        restored has the same value as no backup at all. This piece is what
        to set up, what each kind of backup actually buys, and the quarterly
        drill that proves the system works.
      </p>

      <ArticleH2 id="rto-rpo">RTO and RPO, briefly</ArticleH2>
      <ul>
        <li>
          <strong>RPO (Recovery Point Objective)</strong>: how much data
          loss is acceptable. &quot;Up to 5 minutes&quot; vs &quot;up to 24
          hours&quot;.
        </li>
        <li>
          <strong>RTO (Recovery Time Objective)</strong>: how long the
          restore can take. &quot;Under an hour&quot; vs &quot;same day&quot;.
        </li>
      </ul>
      <p>
        Pick both numbers consciously. They drive what kind of backup
        strategy you need.
      </p>

      <ArticleH2 id="pitr">Point-in-time recovery (PITR)</ArticleH2>
      <p>
        The gold standard. A continuous archive of WAL (write-ahead log)
        segments lets you restore to any point in time within your retention
        window.
      </p>
      <p>
        How it works: a base backup (a snapshot of the data directory) plus
        every WAL segment since. To restore: replay the base backup, then
        the WAL up to your chosen point.
      </p>
      <p>RPO with PITR is typically seconds-to-minutes; RTO depends on database size and how far back you replay.</p>
      <ul>
        <li><strong>Supabase</strong>: PITR included on Pro tier with 7-day retention; up to 30 days on Team.</li>
        <li><strong>Neon</strong>: continuous WAL archive with up to 30-day point-in-time restore.</li>
        <li><strong>RDS</strong>: PITR via automated backups; retention configurable.</li>
        <li><strong>Self-hosted</strong>: pgBackRest, Barman, or WAL-G + S3.</li>
      </ul>

      <ArticleH2 id="pg-dump">Logical dumps (pg_dump)</ArticleH2>
      <p>
        <code>pg_dump</code> produces a SQL or custom-format file that
        recreates the database from scratch. Cheap to generate, very
        portable, but:
      </p>
      <ul>
        <li>
          Locking and load. A dump on a hot database can move significant
          IO. Schedule off-hours or against a replica.
        </li>
        <li>
          Restore time scales with database size: gigabytes of data take
          tens of minutes; terabytes take hours.
        </li>
        <li>
          The dump is consistent at the moment it starts (default), not at
          the moment it finishes. Subsequent writes are lost.
        </li>
      </ul>
      <CodeBlock language="bash" filename="pg_dump.sh">{`# Daily logical dump of one database, custom format, compressed.
pg_dump --format=custom --compress=9 --file=/backups/db-$(date +%F).pgdump \\
  "postgres://user:pass@host/dbname"`}</CodeBlock>
      <p>
        We keep <code>pg_dump</code> in the toolbox for two reasons: it&apos;s
        a clean restore target across Postgres major versions (PITR is
        version-locked), and it&apos;s a good archive format that you can
        keep off-platform.
      </p>

      <ArticleH2 id="snapshots">Storage snapshots</ArticleH2>
      <p>
        Block-level snapshots from your storage provider (EBS, persistent
        disks, Supabase&apos;s underlying volume). Fast to take, near-zero
        impact on the running database.
      </p>
      <p>
        The catch: a snapshot of a running Postgres includes in-flight
        memory state that&apos;s not on disk yet. Restoring from a raw
        snapshot leaves Postgres to recover from WAL on startup, which
        works but is a hair scarier than PITR.
      </p>
      <p>
        Snapshots are great for the &quot;clone production to staging&quot;
        flow. For disaster recovery, prefer PITR.
      </p>

      <ArticleH2 id="managed-providers">What managed providers actually give you</ArticleH2>
      <p>The 2026 baseline across the popular providers:</p>
      <ul>
        <li>
          <strong>Supabase Pro</strong>: 7-day PITR included. Daily logical
          backups for 7 days. Point-in-time restore lands a new project.
        </li>
        <li>
          <strong>Neon</strong>: continuous archive; up to 30 days PITR on
          Scale plan. Branching also works as backup-as-time-travel.
        </li>
        <li>
          <strong>RDS</strong>: 1-35 day automated backups; manual snapshots
          on demand.
        </li>
        <li>
          <strong>Crunchy Bridge</strong>: 14-day PITR by default; longer
          retention via S3 archive option.
        </li>
      </ul>
      <Callout variant="watch-out" title="Cross-region matters">
        Default backups on most providers stay in the same region. A
        regional outage means your backups are in the outage too. Test
        whether your provider replicates backups to a second region; if
        not, ship logical dumps to your own S3 bucket as a belt-and-braces.
      </Callout>

      <ArticleH2 id="the-drill">The restore drill</ArticleH2>
      <p>
        The most important practice: actually restore from backup,
        quarterly, end-to-end. It&apos;s the only thing that proves the
        system works.
      </p>
      <ol>
        <li>Take a snapshot of a known state. Note the timestamp.</li>
        <li>Make a change you can recognise (insert a row, alter a column).</li>
        <li>Restore to the noted timestamp into a separate database.</li>
        <li>Verify the change isn&apos;t there.</li>
        <li>Time the whole thing. That&apos;s your real RTO.</li>
      </ol>
      <p>
        Do this with your team watching. Write down where the friction is.
        Fix it next quarter. By the time you actually need to restore from
        backup, the team has done it three times.
      </p>

      <Callout variant="sparkle" title="The minimum viable setup">
        Daily PITR with at least 7 days of retention + weekly logical dumps
        archived off-platform + a documented restore runbook + a quarterly
        drill. That&apos;s the bar; below it you&apos;re relying on luck.
      </Callout>
    </>
  );
}
