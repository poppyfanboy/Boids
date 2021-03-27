/**
 * Essentially a rip-off of this thing: https://ideone.com/or6C3W
 */

import * as THREE from 'three';
import { Bvh, BvhItem } from './Bvh';
import { assert } from '../dev/Assert';
import { aabbInsideSphere } from '../util/Aabbs';

const MIN_LEAF_NODE_SIZE = 16;

export type ItemData<T extends BinaryBvhItem<T>> = {
    nextItem: T | null;
    ownerNode: Node<T> | null;
};

export interface BinaryBvhItem<T extends BinaryBvhItem<T>> extends BvhItem {
    itemData: ItemData<T>;
}

/**
 * Node of the binary tree. References its child nodes and its parent node.
 * Also References the first and the last item in the linked list of stored
 * items.
 *
 * Each node has AABB bounds which enclose the items stored in the whole
 * subtree.
 */
export class Node<TItem extends BinaryBvhItem<TItem>> {
    ownerBvh: BinaryBvh<TItem>;
    firstItem: TItem | null = null;
    lastItem: TItem | null = null;
    itemsCount = 0;
    leftNode: Node<TItem> | null = null;
    rightNode: Node<TItem> | null = null;
    parentNode: Node<TItem> | null = null;
    private _bounds: THREE.Box3 = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());

    constructor(ownerBvh: BinaryBvh<TItem>) {
        this.ownerBvh = ownerBvh;
    }

    /**
     * Adds an item to the list in the current node without extending the node
     * bounds.
     */
    addItem(item: TItem): void {
        assert(item.itemData.nextItem == null);

        if (this.firstItem == null) {
            this.firstItem = item;
        } else {
            this.lastItem!.itemData.nextItem = item;
        }
        this.lastItem = item;
        item.itemData.ownerNode = this;
        this.itemsCount++;
    }

    /**
     * Appends everything stored (excluding the child nodes) in the `other` node
     * to the current node.
     */
    consumeList(otherNode: Node<TItem>): void {
        if (otherNode.firstItem == null) {
            return;
        }

        // link lists together
        if (this.firstItem == null) {
            this.firstItem = otherNode.firstItem;
        } else {
            this.lastItem!.itemData.nextItem = otherNode.firstItem;
        }
        this.lastItem = otherNode.lastItem;

        // update the owner nodes for the appended list
        let currentItem: BinaryBvhItem<TItem> | null = otherNode.firstItem;
        while (currentItem != null) {
            currentItem.itemData.ownerNode = this;
            currentItem = currentItem.itemData.nextItem;
        }

        // empty the appended list
        otherNode.firstItem = null;
        otherNode.lastItem = null;
        this.itemsCount += otherNode.itemsCount;
        otherNode.itemsCount = 0;
    }

    /**
     * Retrieves every item from the current subtree and adds them to the
     * `otherNode`.
     */
    collapseInto(otherNode: Node<TItem>): void {
        if (this != otherNode) {
            otherNode.consumeList(this);
        }
        if (this.leftNode != null) {
            this.leftNode.collapseInto(otherNode);
            this.leftNode = null;
        }
        if (this.rightNode != null) {
            this.rightNode.collapseInto(otherNode);
            this.rightNode = null;
        }
    }

    /**
     * Traverses the items stored in the current node and updates the bounds for
     * the items. Assumes that child nodes store correct bounds.
     */
    recalculateBounds(): void {
        let newBounds: THREE.Box3 | null = null;
        let currentItem: BinaryBvhItem<TItem> | null = this.firstItem;

        // process the first item, to instantiate bounds if needed
        if (currentItem != null) {
            newBounds = new THREE.Box3().set(currentItem.position, currentItem.position);
            currentItem = currentItem.itemData.nextItem;
        }

        while (currentItem != null) {
            newBounds!.min.min(currentItem.position);
            newBounds!.max.max(currentItem.position);
            currentItem = currentItem.itemData.nextItem;
        }
        // bounds might be still null in case the child node is empty
        if (this.leftNode != null && this.leftNode._bounds != null) {
            if (newBounds == null) {
                newBounds = new THREE.Box3().copy(this.leftNode._bounds);
            } else {
                newBounds.union(this.leftNode._bounds);
            }
        }
        if (this.rightNode != null && this.rightNode._bounds != null) {
            if (newBounds == null) {
                newBounds = new THREE.Box3().copy(this.rightNode._bounds);
            } else {
                newBounds.union(this.rightNode._bounds);
            }
        }

        if (newBounds != null) {
            this._bounds.copy(newBounds);
        }
    }

    /**
     * Supposed to be called after collapsing the node into itself.
     */
    subdivide(): void {
        assert(this.leftNode == null && this.rightNode == null);

        // You need at least (2 * MIN_LEAF_NODE_SIZE) items in the node to
        // subdivide. Take a little higher lower limit to be safe.
        if (this.itemsCount < 3 * MIN_LEAF_NODE_SIZE) {
            return;
        }

        // slice across the longest dimension of the boundary
        const boundsSize = new THREE.Vector3();
        this._bounds.getSize(boundsSize);
        let subdivisionDimension = 0;
        if (boundsSize.x >= boundsSize.y && boundsSize.x >= boundsSize.z) {
            subdivisionDimension = 0;
        } else if (boundsSize.y >= boundsSize.x && boundsSize.y >= boundsSize.z) {
            subdivisionDimension = 1;
        } else {
            subdivisionDimension = 2;
        }

        // find the arithmetic mean of the projections of items positions along
        // the chosen dimension
        let middlePoint = 0;
        {
            let currentItem: BinaryBvhItem<TItem> | null = this.firstItem;
            while (currentItem != null) {
                middlePoint += currentItem.position.getComponent(subdivisionDimension);
                currentItem = currentItem.itemData.nextItem;
            }
            middlePoint /= this.itemsCount;
        }

        // distribute all items in the node between two child nodes
        const newRightNode = new Node(this.ownerBvh);
        const newLeftNode = new Node(this.ownerBvh);
        let currentItem: TItem | null = this.firstItem;
        let nextItem: TItem | null = null;

        while (currentItem != null) {
            nextItem = currentItem.itemData.nextItem;
            currentItem.itemData.nextItem = null;
            if (currentItem.position.getComponent(subdivisionDimension) < middlePoint) {
                newLeftNode.addItem(currentItem);
            } else {
                newRightNode.addItem(currentItem);
            }
            currentItem = nextItem;
        }

        // clear the current list
        this.itemsCount = 0;
        this.firstItem = null;
        this.lastItem = null;

        // in case both children have enough items, recalculate children bounds
        // (at this point children do not have children themselves) and continue
        // subdividing;
        if (
            newLeftNode.itemsCount >= MIN_LEAF_NODE_SIZE &&
            newRightNode.itemsCount >= MIN_LEAF_NODE_SIZE
        ) {
            this.leftNode = newLeftNode;
            this.rightNode = newRightNode;
            newLeftNode.parentNode = this;
            newRightNode.parentNode = this;

            this.leftNode.recalculateBounds();
            this.rightNode.recalculateBounds();
            this.leftNode.subdivide();
            this.rightNode.subdivide();
        } else {
            // otherwise return to the state before subdivision
            this.consumeList(newLeftNode);
            this.consumeList(newRightNode);
        }
    }

    setBoundsFromVector(vector: THREE.Vector3): void {
        this._bounds.min.copy(vector);
        this._bounds.max.copy(vector);
    }

    expandBounds(vector: THREE.Vector3): void {
        this._bounds.min.min(vector);
        this._bounds.max.max(vector);
    }

    set bounds(box: THREE.Box3) {
        this._bounds.copy(box);
    }

    get bounds(): THREE.Box3 {
        return this._bounds;
    }
}

export class BinaryBvh<TItem extends BinaryBvhItem<TItem>> implements Bvh<TItem> {
    private root: Node<TItem> | null = null;
    private _mesh: THREE.Object3D;

    constructor() {
        this._mesh = new THREE.LineSegments();
    }
    insert(item: TItem): void {
        if (item.itemData.ownerNode != null) {
            return;
        }

        // Instantiate the root if needed and update root bounds
        if (this.root == null) {
            this.root = new Node(this);
            this.root.setBoundsFromVector(item.position);
        } else {
            this.root.expandBounds(item.position);
        }

        this.root.addItem(item);
    }

    remove(itemToRemove: TItem): void {
        const ownerNode: Node<TItem> | null = itemToRemove.itemData.ownerNode;

        if (ownerNode == null || ownerNode.ownerBvh != this || ownerNode.itemsCount == 0) {
            return;
        }

        // delete the node from the list
        let currentItem: TItem | null = ownerNode.firstItem;
        let previousItem: TItem | null = null;
        while (currentItem != null) {
            if (currentItem == itemToRemove) {
                if (previousItem == null) {
                    ownerNode.firstItem = currentItem.itemData.nextItem;
                } else {
                    previousItem.itemData.nextItem = currentItem.itemData.nextItem;
                }
                if (currentItem.itemData.nextItem == null) {
                    ownerNode.lastItem = previousItem;
                }
                ownerNode.itemsCount--;
                currentItem.itemData.ownerNode = null;
            }
            previousItem = currentItem;
            currentItem = currentItem.itemData.nextItem;
        }
        assert(itemToRemove != null);

        // in case we deleted an item from the leaf node and there are not
        // enough items left in that node, collapse the whole node into its
        // parent; repeat this process recursively
        let currentNode: Node<TItem> | null = ownerNode;
        while (
            currentNode.itemsCount < MIN_LEAF_NODE_SIZE &&
            currentNode.leftNode == null &&
            currentNode.rightNode == null
        ) {
            // we've reached the root
            if (currentNode.parentNode == null) {
                if (currentNode.itemsCount == 0) {
                    currentNode = null;
                    this.root = null;
                }
                break;
            }
            currentNode.parentNode.consumeList(currentNode);
            if (currentNode.parentNode.leftNode == currentNode) {
                currentNode.parentNode.leftNode = null;
            } else if (currentNode.parentNode.rightNode == currentNode) {
                currentNode.parentNode.rightNode = null;
            }
            currentNode = currentNode.parentNode;
        }

        if (currentNode != null) {
            assert(currentNode.leftNode != null && currentNode.rightNode != null);
            currentNode.recalculateBounds();
        }
    }
    clear(): void {
        this.root = null;
        this.updateMesh();
    }

    rebuild(): void {
        if (this.root == null) {
            return;
        }
        this.root.collapseInto(this.root);
        this.root.subdivide();
    }

    private getAllItems(node: Node<TItem>, yieldItem: (item: TItem) => void): void {
        const nodesToVisit: Node<TItem>[] = [ node ];

        while (nodesToVisit.length > 0) {
            const currentNode: Node<TItem> = nodesToVisit.pop()!;
            if (currentNode.leftNode != null) {
                nodesToVisit.push(currentNode.leftNode);
            }
            if (currentNode.rightNode != null) {
                nodesToVisit.push(currentNode.rightNode);
            }

            let currentItem: TItem | null = currentNode.firstItem;
            while (currentItem != null) {
                yieldItem(currentItem);
                currentItem = currentItem.itemData.nextItem;
            }
        }
    }

    queryItemsFromSphere(
        sphereRange: THREE.Sphere,
        yieldItem: (item: TItem) => void,
    ): void {
        if (this.root == null) {
            return;
        }

        const nodesToVisit: Node<TItem>[] = [ this.root ];

        while (nodesToVisit.length > 0) {
            const currentNode: Node<TItem> = nodesToVisit.pop()!;

            if (!currentNode.bounds.intersectsSphere(sphereRange)) {
                continue;
            }
            if (aabbInsideSphere(currentNode.bounds, sphereRange)) {
                this.getAllItems(currentNode, yieldItem);
                continue;
            }

            let currentItem: TItem | null = currentNode.firstItem;
            while (currentItem != null) {
                if (sphereRange.containsPoint(currentItem.position)) {
                    yieldItem(currentItem);
                }
                currentItem = currentItem.itemData.nextItem;
            }

            if (currentNode.leftNode != null) {
                nodesToVisit.push(currentNode.leftNode);
            }
            if (currentNode.rightNode != null) {
                nodesToVisit.push(currentNode.rightNode);
            }
        }
    }

    get mesh(): THREE.Object3D {
        return this._mesh;
    }

    updateMesh(): void {
        // do nothing
    }
}
