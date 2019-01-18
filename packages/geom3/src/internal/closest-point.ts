import { Fn } from "@thi.ng/api";
import { partial } from "@thi.ng/compose";
import {
    distSq,
    dot,
    empty,
    magSq,
    mixCubic,
    mixN,
    mixQuadratic,
    ReadonlyVec,
    set,
    sub,
    Vec
} from "@thi.ng/vectors3";

export const closestPointArray =
    (p: ReadonlyVec, pts: Vec[]) => {

        let minD = Infinity;
        let closest: Vec;
        for (let i = pts.length; --i >= 0;) {
            const d = distSq(pts[i], p);
            if (d < minD) {
                minD = d;
                closest = pts[i];
            }
        }
        return closest;
    };

export const closestCoeff =
    (p: ReadonlyVec, a: ReadonlyVec, b: ReadonlyVec) => {

        const d = sub([], b, a);
        const l = magSq(d);
        return l > 1e-6 ?
            dot(sub([], p, a), d) / l :
            undefined;
    };

/**
 * Returns closest point to `p` on segment `a` -> `b`. By default, if
 * the result point lies outside the segment, returns a copy of the
 * closest end point. However, if `insideOnly` is true, only returns the
 * closest point if it actually is inside the segment (incl. end
 * points).
 *
 * @param p
 * @param a
 * @param b
 * @param out
 */
export const closestPointSegment =
    (p: ReadonlyVec, a: ReadonlyVec, b: ReadonlyVec, out?: Vec, insideOnly = false) => {

        const t = closestCoeff(p, a, b);
        if (t !== undefined && (!insideOnly || t >= 0 && t <= 1)) {
            out = out || empty(p);
            return t <= 0 ?
                set(out, a) :
                t >= 1 ?
                    set(out, b) :
                    mixN(out, a, b, t);
        }
    };

export const closestPointPolyline =
    (p: ReadonlyVec, pts: ReadonlyArray<Vec>, closed = false) => {
        const closest = empty(pts[0]);
        const tmp = empty(closest);
        const n = pts.length - 1;
        let minD = Infinity, i, j;
        if (closed) {
            i = n;
            j = 0;
        } else {
            i = 0;
            j = 1;
        }
        for (; j <= n; i = j, j++) {
            if (closestPointSegment(p, pts[i], pts[j], tmp)) {
                const d = distSq(p, tmp);
                if (d < minD) {
                    minD = d;
                    set(closest, tmp);
                }
            }
        }
        return closest;
    };

/**
 * Returns the index of the start point containing the segment in the
 * polyline array `points` farthest away from `p` with regards to the
 * line segment `a` to `b`. `points` is only checked between indices
 * `from` and `to` (not including the latter).
 *
 * @param a
 * @param b
 * @param points
 * @param from
 * @param to
 */
export const farthestPointSegment =
    (a: ReadonlyVec, b: ReadonlyVec, points: ReadonlyVec[], from = 0, to = points.length) => {
        let maxD = -1;
        let maxIdx;
        const tmp = empty(a);
        for (let i = from; i < to; i++) {
            const p = points[i];
            const d = distSq(p, closestPointSegment(p, a, b, tmp) || a);
            if (d > maxD) {
                maxD = d;
                maxIdx = i;
            }
        }
        return [maxIdx, Math.sqrt(maxD)];
    };

/**
 * Performs recursive search for closest point to `p` on cubic curve
 * defined by control points `a`,`b`,`c`,`d`. The `res` and `recur`
 * params are used to control the recursion behavior. See `closestT`.
 *
 * @param p
 * @param a
 * @param b
 * @param c
 * @param d
 * @param res
 * @param iter
 */
export const closestPointCubic = (
    p: ReadonlyVec,
    a: ReadonlyVec,
    b: ReadonlyVec,
    c: ReadonlyVec,
    d: ReadonlyVec,
    res = 8,
    iter = 4
) => {
    const fn = partial(mixCubic, [], a, b, c, d);
    return fn(closestT(fn, p, res, iter, 0, 1));
};

/**
 * Performs recursive search for closest point to `p` on quadratic curve
 * defined by control points `a`,`b`,`c`. The `res` and `recur` params
 * are used to control the recursion behavior. See `closestT`.
 *
 * @param p
 * @param a
 * @param b
 * @param c
 * @param res
 * @param iter
 */
export const closestPointQuadratic = (
    p: ReadonlyVec,
    a: ReadonlyVec,
    b: ReadonlyVec,
    c: ReadonlyVec,
    res = 8,
    iter = 4
) => {
    const fn = partial(mixQuadratic, [], a, b, c);
    return fn(closestT(fn, p, res, iter, 0, 1));
};

/**
 * Recursively evaluates function `fn` for `res` uniformly spaced values
 * `t` in the closed interval `[start,end]` to compute points on a curve
 * and returns the `t` producing the minimum distance to query point
 * `p`. At each level of recursion the search interval is increasingly
 * centered around the currently best `t`.
 *
 * @param fn
 * @param p
 * @param res
 * @param iter
 * @param start
 * @param end
 */
const closestT = (
    fn: Fn<number, Vec>,
    p: ReadonlyVec,
    res: number,
    iter: number,
    start: number,
    end: number
) => {
    if (iter <= 0) return (start + end) / 2;
    const delta = (end - start) / res;
    let minT = start;
    let minD = Infinity;
    for (let i = 0; i <= res; i++) {
        const t = start + i * delta;
        const q = fn(t);
        const d = distSq(p, q);
        if (d < minD) {
            minD = d;
            minT = t;
        }
    }
    return closestT(
        fn, p, res, iter - 1,
        Math.max(minT - delta, 0),
        Math.min(minT + delta, 1)
    );
};
