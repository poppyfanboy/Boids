import * as THREE from 'three';
import { Vector3 } from 'three';
import { Boid } from './Boid';
import { mirrorInsideAabb, vectorToAabbBoundary } from './util/Aabbs';
import Octree from './bvh/Octree';

const DEFAULT_DESIRED_VELOCITY = 1;
const DEFAULT_PERCEPTION_RADIUS = 1;
const DEFAULT_VIEW_ANGLE = Math.PI / 3;

const INFINITE_BOX = new THREE.Box3(
    new Vector3(-Infinity, -Infinity, -Infinity),
    new Vector3(Infinity, Infinity, Infinity),
);

export abstract class BoidBehavior<TUpdateArgs = unknown> {
    constructor(
        /**
         * Effectively how much does the force affect a boid.
         */
        protected desiredVelocity = DEFAULT_DESIRED_VELOCITY,
        protected _force = new Vector3(),
    ) {}

    get force(): Vector3 {
        return this._force;
    }

    /**
     * Needs to be called on every frame, it is assumed that the force
     * computation is performed in this method.
     */
    abstract update(boid: Boid, args?: TUpdateArgs): void;
}

/**
 * Intended to use as a default value wherever you need a default dummy
 * behavior.
 */
export class DummyBehavior extends BoidBehavior {
    update(_boid: Boid): void {
        // do nothing
    }
}

/**
 * Combines several behaviors. You can't pass any arguments to the underlying
 * behaviors because it'd make the class unnecessary complicated. Store
 * behaviors which need special arguments passed to their update method as
 * separate behaviors instead.
 */
export class CombinedBehavior extends BoidBehavior {
    private behaviorsList: BoidBehavior[];
    private maxForce: number;

    constructor(maxForce: number, ...behaviorsList: BoidBehavior[]) {
        super();

        this.maxForce = maxForce;
        this.behaviorsList = behaviorsList;
    }

    update(boid: Boid): void {
        this._force.set(0, 0, 0);

        for (let i = 0; i < this.behaviorsList.length; i++) {
            const behavior: BoidBehavior<unknown> = this.behaviorsList[i];
            behavior.update(boid);
            this._force.add(behavior.force);
        }

        this._force.normalize().multiplyScalar(this.maxForce);
    }
}

/**
 * Avoid colliding with the bounding box (this force won't affect boids
 * traveling alongside the bounding box).
 */
export class AvoidBox extends BoidBehavior {
    constructor(
        desiredVelocity = DEFAULT_DESIRED_VELOCITY,
        private perceptionRadius = DEFAULT_PERCEPTION_RADIUS,
        private boundingBox = INFINITE_BOX,
    ) {
        super(desiredVelocity);
    }

    update(boid: Boid): void {
        this._force.set(0, 0, 0);

        const nextPredictedPosition: Vector3 = boid.position.clone().add(
            boid.velocity
                .clone()
                .normalize()
                .multiplyScalar(2 * this.perceptionRadius),
        );

        if (
            this.boundingBox.containsPoint(boid.position) &&
            !this.boundingBox.containsPoint(nextPredictedPosition)
        ) {
            const target: Vector3 = mirrorInsideAabb(nextPredictedPosition, this.boundingBox);
            const desiredVelocity: Vector3 = target
                .clone()
                .sub(boid.position)
                .normalize()
                .multiplyScalar(this.desiredVelocity);

            this._force.add(desiredVelocity.sub(boid.velocity));
        }
    }
}

/**
 * Return inside the bounding box if got outside.
 */
export class ReturnInsideBox extends BoidBehavior {
    constructor(desiredVelocity = DEFAULT_DESIRED_VELOCITY, private boundingBox = INFINITE_BOX) {
        super(desiredVelocity);
    }

    update(boid: Boid): void {
        this._force.set(0, 0, 0);

        if (!this.boundingBox.containsPoint(boid.position)) {
            const aabbCenter = new Vector3();
            this.boundingBox.getCenter(aabbCenter);
            const desiredVelocity: Vector3 = aabbCenter
                .sub(boid.position)
                .normalize()
                .multiplyScalar(this.desiredVelocity);

            this._force.add(desiredVelocity.sub(boid.velocity));
        }
    }
}

/**
 * If a boid is too close to the bounding box edge (whilst staying inside),
 * move away from the edge. Particularly this force will affect boids
 * moving alongside the bounding box preventing them from being near the
 * bounding box edges all the time.
 */
export class AvoidBoxEdges extends BoidBehavior {
    constructor(desiredVelocity = DEFAULT_DESIRED_VELOCITY, private boundingBox = INFINITE_BOX) {
        super(desiredVelocity);
    }

    update(boid: Boid): void {
        this._force.set(0, 0, 0);

        const distanceToBoundary: number = vectorToAabbBoundary(
            boid.position,
            this.boundingBox,
        ).length();

        if (this.boundingBox.containsPoint(boid.position) && distanceToBoundary < boid.size) {
            const aabbCenter = new Vector3();
            const scaleFactor: number = 1 - distanceToBoundary / boid.size;
            this.boundingBox.getCenter(aabbCenter);
            const desiredVelocity: Vector3 = aabbCenter
                .sub(boid.position)
                .normalize()
                .multiplyScalar(this.desiredVelocity * scaleFactor);

            this._force.add(desiredVelocity.sub(boid.velocity));
        }
    }
}

export type FlockingBehaviorArgs = {
    otherBoids: Boid[];
    otherBoidsMaxDistance: number;
};

/**
 * Forces a boid to go away from its neighbors depending on the distance to
 * them.
 */
export class SeparationBehavior extends BoidBehavior<FlockingBehaviorArgs> {
    constructor(
        private boidsOctree: Octree<Boid>,
        desiredVelocity = DEFAULT_DESIRED_VELOCITY,
        private _perceptionRadius = DEFAULT_PERCEPTION_RADIUS,
        private boundingBox = INFINITE_BOX,
    ) {
        super(desiredVelocity);
    }

    update(boid: Boid, args?: FlockingBehaviorArgs): void {
        this._force.set(0, 0, 0);

        if (!this.boundingBox.containsPoint(boid.position)) {
            return;
        }

        const desiredVelocity = new Vector3(0, 0, 0);
        let neighborsCount = 0;
        const updateDesiredVelocity = (otherBoid: Boid) => {
            if (otherBoid == boid) {
                return;
            }

            const directionFromOther: Vector3 = boid.position.clone().sub(otherBoid.position);
            const distanceToOther: number = directionFromOther.length();
            if (distanceToOther < this._perceptionRadius) {
                desiredVelocity.add(
                    directionFromOther
                        .divideScalar(distanceToOther * distanceToOther)
                        .multiplyScalar(this.desiredVelocity),
                );
                neighborsCount++;
            }
        };

        if (args == null || this._perceptionRadius > args.otherBoidsMaxDistance) {
            this.boidsOctree.queryElementsFromSphere(
                new THREE.Sphere(boid.position, this._perceptionRadius),
                updateDesiredVelocity,
            );
        } else {
            for (let i = 0; i < args.otherBoids.length; i++) {
                if (
                    args.otherBoidsMaxDistance == this._perceptionRadius ||
                    boid.position.distanceTo(args.otherBoids[i].position) < this._perceptionRadius
                ) {
                    updateDesiredVelocity(args.otherBoids[i]);
                }
            }
        }

        if (neighborsCount > 0) {
            this._force.add(desiredVelocity.sub(boid.velocity));
        }
    }

    get perceptionRadius(): number {
        return this._perceptionRadius;
    }
}

/**
 * Pushes a boid in the direction where its *visible* neighbors are. Visible
 * neighbors are those that are close enough and are inside the angle of view of
 * the boid.
 */
export class CohesionBehavior extends BoidBehavior<FlockingBehaviorArgs> {
    constructor(
        private boidsOctree: Octree<Boid>,
        desiredVelocity = DEFAULT_DESIRED_VELOCITY,
        private _perceptionRadius = DEFAULT_PERCEPTION_RADIUS,
        private boundingBox = INFINITE_BOX,
        private viewAngle = DEFAULT_VIEW_ANGLE,
    ) {
        super(desiredVelocity);
    }

    update(boid: Boid, args?: FlockingBehaviorArgs): void {
        this._force.set(0, 0, 0);

        if (!this.boundingBox.containsPoint(boid.position)) {
            return;
        }

        const neighborsCenter = new Vector3(0, 0, 0);
        let neighborsCount = 0;
        const updateNeighborsCenter = (otherBoid: Boid) => {
            if (otherBoid == boid) {
                return;
            }

            const directionToOther: Vector3 = otherBoid.position.clone().sub(boid.position);
            if (directionToOther.angleTo(boid.orientation.forward) < this.viewAngle) {
                neighborsCenter.add(otherBoid.position);
                neighborsCount++;
            }
        };

        if (args == null || this._perceptionRadius > args.otherBoidsMaxDistance) {
            this.boidsOctree.queryElementsFromSphere(
                new THREE.Sphere(boid.position, this._perceptionRadius),
                updateNeighborsCenter,
            );
        } else {
            for (let i = 0; i < args.otherBoids.length; i++) {
                if (
                    args.otherBoidsMaxDistance == this._perceptionRadius ||
                    boid.position.distanceTo(args.otherBoids[i].position) < this._perceptionRadius
                ) {
                    updateNeighborsCenter(args.otherBoids[i]);
                }
            }
        }

        if (neighborsCount > 0) {
            neighborsCenter.divideScalar(neighborsCount);
            this._force.add(
                neighborsCenter
                    .sub(boid.position)
                    .sub(boid.velocity)
                    .normalize()
                    .multiplyScalar(this.desiredVelocity),
            );
        }
    }

    get perceptionRadius(): number {
        return this._perceptionRadius;
    }
}

export class AlignmentBehavior extends BoidBehavior<FlockingBehaviorArgs> {
    constructor(
        private boidsOctree: Octree<Boid>,
        desiredVelocity = DEFAULT_DESIRED_VELOCITY,
        private _perceptionRadius = DEFAULT_PERCEPTION_RADIUS,
        private boundingBox = INFINITE_BOX,
    ) {
        super(desiredVelocity);
    }

    update(boid: Boid, args?: FlockingBehaviorArgs): void {
        this._force.set(0, 0, 0);

        if (!this.boundingBox.containsPoint(boid.position)) {
            return;
        }

        const desiredVelocity = new Vector3(0, 0, 0);
        let neighborsCount = 0;
        const updateDesiredVelocity = (otherBoid: Boid) => {
            if (otherBoid == boid) {
                return;
            }
            desiredVelocity.add(otherBoid.velocity);
            neighborsCount++;
        };

        if (args == null || this._perceptionRadius > args.otherBoidsMaxDistance) {
            this.boidsOctree.queryElementsFromSphere(
                new THREE.Sphere(boid.position, this._perceptionRadius),
                updateDesiredVelocity,
            );
        } else {
            for (let i = 0; i < args.otherBoids.length; i++) {
                if (
                    args.otherBoidsMaxDistance == this._perceptionRadius ||
                    boid.position.distanceTo(args.otherBoids[i].position) < this._perceptionRadius
                ) {
                    updateDesiredVelocity(args.otherBoids[i]);
                }
            }
        }

        if (neighborsCount > 0) {
            this._force.add(
                desiredVelocity.divideScalar(neighborsCount).multiplyScalar(this.desiredVelocity),
            );
        }
    }

    get perceptionRadius(): number {
        return this._perceptionRadius;
    }
}

/**
 * Since separation, cohesion and alignment all query the octree and they all
 * have almost same perception radii, they can be combined into a single
 * behavior to reduce the number of calls to the octree.
 */
export class FlockingBehavior extends BoidBehavior {
    constructor(
        private boidsOctree: Octree<Boid>,
        private separation: SeparationBehavior,
        private cohesion: CohesionBehavior,
        private alignment: AlignmentBehavior,
    ) {
        super();
    }

    update(boid: Boid): void {
        this._force.set(0, 0, 0);

        let neighborsCount = 0;
        const maxPerceptionRadius: number = Math.max(
            this.separation.perceptionRadius,
            Math.max(this.cohesion.perceptionRadius, this.alignment.perceptionRadius),
        );
        const neighborBoids: Boid[] = [];
        this.boidsOctree.queryElementsFromSphere(
            new THREE.Sphere(boid.position, maxPerceptionRadius),
            (otherBoid: Boid) => {
                if (otherBoid != boid) {
                    neighborBoids.push(otherBoid);
                    neighborsCount++;
                }
            },
        );

        if (neighborsCount > 0) {
            this.separation.update(boid, {
                otherBoids: neighborBoids,
                otherBoidsMaxDistance: maxPerceptionRadius,
            });
            this.cohesion.update(boid, {
                otherBoids: neighborBoids,
                otherBoidsMaxDistance: maxPerceptionRadius,
            });
            this.alignment.update(boid, {
                otherBoids: neighborBoids,
                otherBoidsMaxDistance: maxPerceptionRadius,
            });

            this._force.add(this.cohesion.force);
            this._force.add(this.alignment.force);
            this._force.add(this.separation.force);
        }
    }
}

export class ThrustBehavior extends BoidBehavior {
    constructor(desiredVelocity = DEFAULT_DESIRED_VELOCITY) {
        super(desiredVelocity);
    }

    update(boid: Boid): void {
        this._force.copy(boid.orientation.forward.clone().multiplyScalar(this.desiredVelocity));
    }
}
