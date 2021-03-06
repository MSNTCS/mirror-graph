DROP FUNCTION IF EXISTS public.balanceHistory;

CREATE OR REPLACE FUNCTION public.balanceHistory(
  _address varchar,
  _from timestamp,
  _to timestamp,
  _interval integer
)
  RETURNS TABLE ("timestamp" timestamp, "value" numeric)
  LANGUAGE 'plpgsql'
  VOLATILE 
AS $BODY$
DECLARE
  timeIterator timestamp := _from;
  timeIteratorNext timestamp;
BEGIN
  LOOP
    timeIteratorNext := timeIterator + (_interval * interval '1 minute');

    RETURN QUERY
    SELECT
      timeIterator as "timestamp",
      COALESCE((SELECT SUM(uusd_change) FROM tx WHERE address=_address AND datetime > timeIteratorNext), 0)
      +COALESCE(SUM(pb.assetValue), 0) AS "value"
    FROM (
      SELECT
        DISTINCT ON (token) token,
        (CASE
          WHEN b.token = 'uusd' THEN b.balance
          WHEN b.balance > 0 THEN
            COALESCE((SELECT p.close FROM price p
              WHERE p.token = b.token AND p.datetime <= timeIteratorNext
              ORDER BY p.datetime DESC LIMIT 1), 0) * b.balance
          ELSE 0
        END) AS assetValue
      FROM balance b
      WHERE b.address=_address AND b.datetime <= timeIteratorNext
      ORDER BY token, id DESC
    ) AS pb;

    EXIT WHEN timeIterator >= _to;

    timeIterator := timeIteratorNext;
  END LOOP;

END;
$BODY$;
